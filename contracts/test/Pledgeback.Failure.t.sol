// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PledgebackTestBase, ReentrantAttacker, RejectingReceiver} from "./Pledgeback.Base.t.sol";
import {Pledgeback} from "../Pledgeback.sol";

contract PledgebackFailureTest is PledgebackTestBase {

    // -----------------------------------------------------------------------
    // 7. test_failure_exampleCampaignB  (exact amounts per spec)
    //    Also checks positionOf before and after each claim.
    // -----------------------------------------------------------------------
    function test_failure_exampleCampaignB() public {
        // campaignId already created: goal=1e18, orgBonus=5e16 by organizer
        // sponsor adds another 5e16
        vm.prank(sponsor);
        pb.addBonus{value: SPO_BONUS}(campaignId);

        // backer1 pledges 0.20 USDC (2e17)
        vm.prank(backer1);
        pb.pledge{value: 2e17}(campaignId);

        // backer2 pledges 0.10 USDC (1e17)
        vm.prank(backer2);
        pb.pledge{value: 1e17}(campaignId);

        // --- positionOf before deadline — owed fields must be 0 ---
        (,,,, uint256 refundOwed1,,) = pb.positionOf(campaignId, backer1);
        assertEq(refundOwed1, 0, "no refund owed while active");

        // Expire campaign (fails: pledged 3e17 < goal 1e18)
        _expireCampaign();

        // Verify status = 2 (Failed)
        assertEq(pb.status(campaignId), 2);

        // organizer cannot collect
        vm.prank(organizer);
        vm.expectRevert(Pledgeback.GoalNotMet.selector);
        pb.collect(campaignId);

        // --- positionOf after failure, before claims ---
        // bonusPool = 1e17, goal = 1e18
        // backer1: 2e17 + 2e17*1e17/1e18 = 2e17 + 2e16 = 22e16
        (uint256 pAmt1,,bool rd1,,uint256 rOwed1,,) = pb.positionOf(campaignId, backer1);
        assertEq(pAmt1, 2e17);
        assertEq(rOwed1, 22e16, "backer1 refundOwed before claim");
        assertFalse(rd1);

        // backer2: 1e17 + 1e17*1e17/1e18 = 11e16
        (,,,,uint256 rOwed2,,) = pb.positionOf(campaignId, backer2);
        assertEq(rOwed2, 11e16, "backer2 refundOwed before claim");

        // organizer: 5e16*(1e18-3e17)/1e18 = 35e15
        (,,,,, uint256 bOwed_org,) = pb.positionOf(campaignId, organizer);
        assertEq(bOwed_org, 35e15, "organizer bonusOwed before claim");

        // sponsor: same = 35e15
        (,,,,, uint256 bOwed_spo,) = pb.positionOf(campaignId, sponsor);
        assertEq(bOwed_spo, 35e15, "sponsor bonusOwed before claim");

        // backer1 refund = 22e16
        uint256 b1Before = backer1.balance;
        vm.prank(backer1);
        pb.claimRefund(campaignId);
        assertEq(backer1.balance - b1Before, 22e16, "backer1 refund");

        // positionOf after backer1 claims
        (,,bool rd1After,, uint256 rOwed1After,,) = pb.positionOf(campaignId, backer1);
        assertTrue(rd1After, "refundDone after claim");
        assertEq(rOwed1After, 0, "refundOwed zero after claim");

        // backer2 refund = 11e16
        uint256 b2Before = backer2.balance;
        vm.prank(backer2);
        pb.claimRefund(campaignId);
        assertEq(backer2.balance - b2Before, 11e16, "backer2 refund");

        // organizer reclaimBonus = 5e16 * (1e18 - 3e17) / 1e18 = 35e15
        uint256 orgBefore = organizer.balance;
        vm.prank(organizer);
        pb.reclaimBonus(campaignId);
        assertEq(organizer.balance - orgBefore, 35e15, "organizer reclaimBonus");

        // positionOf after organizer claims bonus
        (,,,,, uint256 bOwedOrgAfter,) = pb.positionOf(campaignId, organizer);
        assertEq(bOwedOrgAfter, 0, "organizer bonusOwed zero after claim");

        // sponsor reclaimBonus = 5e16 * 7e17 / 1e18 = 35e15
        uint256 spoBefore = sponsor.balance;
        vm.prank(sponsor);
        pb.reclaimBonus(campaignId);
        assertEq(sponsor.balance - spoBefore, 35e15, "sponsor reclaimBonus");
    }

    // -----------------------------------------------------------------------
    // 8. test_failure_doubleClaimReverts
    // -----------------------------------------------------------------------
    function test_failure_doubleClaimReverts() public {
        vm.prank(backer1);
        pb.pledge{value: 1e17}(campaignId);

        _expireCampaign();

        // claimRefund twice
        vm.prank(backer1);
        pb.claimRefund(campaignId);
        vm.prank(backer1);
        vm.expectRevert(Pledgeback.AlreadyClaimed.selector);
        pb.claimRefund(campaignId);

        // reclaimBonus twice (organizer)
        vm.prank(organizer);
        pb.reclaimBonus(campaignId);
        vm.prank(organizer);
        vm.expectRevert(Pledgeback.AlreadyClaimed.selector);
        pb.reclaimBonus(campaignId);
    }

    // -----------------------------------------------------------------------
    // 9. test_failure_noPledges_sponsorsGetEverythingBack
    // -----------------------------------------------------------------------
    function test_failure_noPledges_sponsorsGetEverythingBack() public {
        // No pledges — campaign fails, sponsor reclaims full contribution
        _expireCampaign();

        assertEq(pb.status(campaignId), 2); // Failed

        // contribution * (goal - 0) / goal = contribution
        uint256 before = organizer.balance;
        vm.prank(organizer);
        pb.reclaimBonus(campaignId);
        assertEq(organizer.balance - before, ORG_BONUS, "full bonus returned when no pledges");
    }

    // -----------------------------------------------------------------------
    // 11. test_lateLargePledgeDoesNotDiluteEarlierBackers
    //     Late pledge is LARGER than the early one.
    //     Early backer's payout is identical with and without it.
    // -----------------------------------------------------------------------
    function test_lateLargePledgeDoesNotDiluteEarlierBackers() public {
        // Early backer pledges 0.3 USDC
        uint256 earlyPledge = 3e17;
        vm.prank(backer1);
        pb.pledge{value: earlyPledge}(campaignId);

        // Compute what backer1 is owed without the late pledge
        // bonusPool = ORG_BONUS (5e16), goal = 1e18
        uint256 expectedBonusShare = (earlyPledge * ORG_BONUS) / GOAL;
        uint256 expectedPayout = earlyPledge + expectedBonusShare;

        // Late pledge is LARGER than the early one (5e17 > 3e17), still misses goal
        uint256 latePledge = 5e17;
        vm.prank(backer2);
        pb.pledge{value: latePledge}(campaignId);
        // total pledged = 8e17 < 1e18 — campaign will fail

        _expireCampaign();

        // Payout formula uses bonusPool/goal (a fixed rate), so backer1's payout
        // is identical regardless of other pledges.
        uint256 before = backer1.balance;
        vm.prank(backer1);
        pb.claimRefund(campaignId);
        assertEq(backer1.balance - before, expectedPayout, "early backer payout unchanged despite late large pledge");
    }

    // -----------------------------------------------------------------------
    // 12. test_reentrantBackerCannotDoubleClaim
    //     Attacker is both a backer AND a sponsor.
    //     Proves only one payout each (claimRefund and reclaimBonus).
    // -----------------------------------------------------------------------
    function test_reentrantBackerCannotDoubleClaim() public {
        // Deploy attacker, fund it, have it pledge AND add bonus
        ReentrantAttacker attacker = new ReentrantAttacker(address(pb), campaignId, address(this));
        vm.deal(address(attacker), 10 ether);

        // Attacker pledges as backer
        vm.prank(address(attacker));
        pb.pledge{value: 1e17}(campaignId);

        // Attacker also adds bonus as sponsor
        vm.prank(address(attacker));
        pb.addBonus{value: 5e16}(campaignId);

        _expireCampaign();

        // attack() calls claimRefund; receive() tries to re-enter claimRefund AND
        // reclaimBonus — the reentrancy guard blocks both inner calls.
        uint256 before = address(attacker).balance;
        attacker.attack();

        // Attacker got exactly one claimRefund payout (pledge + pro-rata bonus).
        // bonusPool = ORG_BONUS + 5e16 (attacker's own bonus) = 1e17
        // refund = 1e17 + 1e17 * 1e17 / 1e18 = 1e17 + 1e16 = 11e16
        uint256 totalBonusPool = ORG_BONUS + 5e16;
        uint256 bonusShare = (1e17 * totalBonusPool) / GOAL;
        uint256 expectedRefund = 1e17 + bonusShare;
        assertEq(address(attacker).balance - before, expectedRefund, "exactly one claimRefund paid");

        // Verify refunded flag set, bonusReclaimed not yet set
        assertTrue(pb.refunded(campaignId, address(attacker)), "refundDone set");
        assertFalse(pb.bonusReclaimed(campaignId, address(attacker)), "bonusDone not yet set");

        // Now the attacker calls reclaimBonus directly (outer call, not re-entrant)
        uint256 before2 = address(attacker).balance;
        vm.prank(address(attacker));
        pb.reclaimBonus(campaignId);

        // reclaimBonus payout: contribution*(goal-pledged)/goal
        // pledged = 1e17, contribution = 5e16
        uint256 pledged = 1e17; // only the attacker pledged
        uint256 bonusReclaim = (5e16 * (GOAL - pledged)) / GOAL;
        assertEq(address(attacker).balance - before2, bonusReclaim, "exactly one reclaimBonus paid");

        // Verify bonusReclaimed flag set
        assertTrue(pb.bonusReclaimed(campaignId, address(attacker)), "bonusDone set");

        // Second reclaimBonus reverts
        vm.prank(address(attacker));
        vm.expectRevert(Pledgeback.AlreadyClaimed.selector);
        pb.reclaimBonus(campaignId);
    }

    // -----------------------------------------------------------------------
    // 13. test_rejectingBackerOnlyBlocksItself
    // -----------------------------------------------------------------------
    function test_rejectingBackerOnlyBlocksItself() public {
        RejectingReceiver rejecter = new RejectingReceiver();
        vm.deal(address(rejecter), 10 ether);

        // rejecter pledges
        rejecter.pledge{value: 1e17}(pb, campaignId);

        // backer1 also pledges
        vm.prank(backer1);
        pb.pledge{value: 2e17}(campaignId);

        _expireCampaign();

        // rejecter cannot claim — TransferFailed
        vm.expectRevert(Pledgeback.TransferFailed.selector);
        rejecter.claimRefund(pb, campaignId);

        // backer1 can still claim normally
        uint256 before = backer1.balance;
        vm.prank(backer1);
        pb.claimRefund(campaignId);
        uint256 bonusShare = (2e17 * ORG_BONUS) / GOAL;
        assertEq(backer1.balance - before, 2e17 + bonusShare, "backer1 claims despite rejecter");
    }
}

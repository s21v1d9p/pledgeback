// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PledgebackTestBase} from "./Pledgeback.Base.t.sol";
import {Pledgeback} from "../Pledgeback.sol";

contract PledgebackCoreTest is PledgebackTestBase {

    // -----------------------------------------------------------------------
    // 1. test_create_storesCampaignAndBonus
    //    Includes: zero bonus, zero goal, goal > 1e30, deadline edges, text edges.
    // -----------------------------------------------------------------------
    function test_create_storesCampaignAndBonus() public {
        // Verify the standard campaign created in setUp
        Pledgeback.CampaignView[] memory views = pb.getCampaigns(campaignId, 1);
        Pledgeback.CampaignView memory v = views[0];

        assertEq(v.id,           campaignId);
        assertEq(v.organizer,    organizer);
        assertEq(v.goal,         GOAL);
        assertEq(v.bonusPool,    ORG_BONUS);
        assertEq(v.status,       0);  // Active
        assertEq(v.sponsorCount, 1);

        // Organizer is listed as first sponsor
        (address[] memory addrs,) = pb.getSponsors(campaignId, 0, 10);
        assertEq(addrs[0], organizer);

        // --- Revert: zero bonus
        uint64 dl = uint64(block.timestamp + 1 days);
        vm.prank(organizer);
        vm.expectRevert(Pledgeback.ZeroAmount.selector);
        pb.create{value: 0}("T", "", GOAL, dl);

        // --- Revert: zero goal
        vm.prank(organizer);
        vm.expectRevert(Pledgeback.InvalidGoal.selector);
        pb.create{value: 1e15}("T", "", 0, dl);

        // --- Revert: goal above 1e30 (one trillion USDC + 1 wei)
        vm.prank(organizer);
        vm.expectRevert(Pledgeback.InvalidGoal.selector);
        pb.create{value: 1e15}("T", "", 1e30 + 1, dl);

        // --- Revert: deadline too soon (< 10 min)
        uint64 tooSoon = uint64(block.timestamp + 9 minutes);
        vm.prank(organizer);
        vm.expectRevert(Pledgeback.InvalidDeadline.selector);
        pb.create{value: 1e15}("T", "", GOAL, tooSoon);

        // --- Revert: deadline too far (> 180 days)
        uint64 tooFar = uint64(block.timestamp + 181 days);
        vm.prank(organizer);
        vm.expectRevert(Pledgeback.InvalidDeadline.selector);
        pb.create{value: 1e15}("T", "", GOAL, tooFar);

        // --- Revert: empty title
        vm.prank(organizer);
        vm.expectRevert(Pledgeback.InvalidText.selector);
        pb.create{value: 1e15}("", "", GOAL, dl);

        // --- Revert: title over 80 bytes (81 chars)
        string memory longTitle =
            "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // 81
        vm.prank(organizer);
        vm.expectRevert(Pledgeback.InvalidText.selector);
        pb.create{value: 1e15}(longTitle, "", GOAL, dl);

        // --- Revert: link over 200 bytes (201 chars)
        string memory longLink =
            "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // 201 A
        vm.prank(organizer);
        vm.expectRevert(Pledgeback.InvalidText.selector);
        pb.create{value: 1e15}("T", longLink, GOAL, dl);
    }

    // -----------------------------------------------------------------------
    // Limits accepted at the edge:
    //   80-byte title, 200-byte link, deadline exactly +10 min and +180 days,
    //   goal exactly 1e30; goal of 1e30 + 1 reverts with InvalidGoal.
    // -----------------------------------------------------------------------
    function test_create_limitsAcceptedAtEdge() public {
        // 80-byte title (exactly at limit)
        string memory title80 =
            "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // 80
        // Build exactly 200-char string in Solidity
        bytes memory b200 = new bytes(200);
        for (uint i = 0; i < 200; i++) b200[i] = "A";
        string memory link200exact = string(b200);

        // Deadline exactly +10 minutes
        uint64 dlMin = uint64(block.timestamp + 10 minutes);
        vm.prank(organizer);
        uint256 id1 = pb.create{value: 1e15}(title80, link200exact, 1e30, dlMin);
        assertGt(id1, 0);

        // Deadline exactly +180 days
        uint64 dlMax = uint64(block.timestamp + 180 days);
        vm.prank(organizer);
        uint256 id2 = pb.create{value: 1e15}("T", "", 1e30, dlMax);
        assertGt(id2, 0);

        // Goal exactly 1e30 succeeds (already tested above via id1 — just confirm stored)
        Pledgeback.CampaignView[] memory views = pb.getCampaigns(id1, 1);
        assertEq(views[0].goal, 1e30);

        // Goal 1e30 + 1 reverts
        vm.prank(organizer);
        vm.expectRevert(Pledgeback.InvalidGoal.selector);
        pb.create{value: 1e15}("T", "", 1e30 + 1, dlMin);
    }

    // -----------------------------------------------------------------------
    // 2. test_pledge_tracksBackersAndTotals
    //    Also asserts campaign's total pledged.
    // -----------------------------------------------------------------------
    function test_pledge_tracksBackersAndTotals() public {
        uint256 p1 = 3e17;
        uint256 p2 = 2e17;

        vm.prank(backer1);
        pb.pledge{value: p1}(campaignId);

        vm.prank(backer2);
        pb.pledge{value: p2}(campaignId);

        // Pledge amounts tracked
        assertEq(pb.pledgeOf(campaignId, backer1), p1);
        assertEq(pb.pledgeOf(campaignId, backer2), p2);

        // Campaign total pledged
        Pledgeback.CampaignView[] memory views = pb.getCampaigns(campaignId, 1);
        assertEq(views[0].pledged, p1 + p2, "campaign total pledged mismatch");

        // backerCount grows to 2
        assertEq(views[0].backerCount, 2);

        // Backer1 pledges again — still only counted once
        vm.prank(backer1);
        pb.pledge{value: 1e16}(campaignId);
        views = pb.getCampaigns(campaignId, 1);
        assertEq(views[0].backerCount, 2);
        assertEq(pb.pledgeOf(campaignId, backer1), p1 + 1e16);
        assertEq(views[0].pledged, p1 + p2 + 1e16, "campaign total after second pledge");

        // --- Revert: after deadline
        _expireCampaign();
        vm.prank(backer3);
        vm.expectRevert(Pledgeback.CampaignClosed.selector);
        pb.pledge{value: 1e15}(campaignId);

        // --- Revert: zero value (re-deploy fresh campaign)
        Pledgeback pb2 = new Pledgeback();
        vm.deal(backer1, 10 ether);
        uint64 dl2 = uint64(block.timestamp + 1 days);
        vm.prank(organizer);
        vm.deal(organizer, 10 ether);
        uint256 id2 = pb2.create{value: 1e15}("T2", "", GOAL, dl2);
        vm.prank(backer1);
        vm.expectRevert(Pledgeback.ZeroAmount.selector);
        pb2.pledge{value: 0}(id2);

        // --- Revert: unknown id
        vm.prank(backer1);
        vm.expectRevert(Pledgeback.UnknownCampaign.selector);
        pb2.pledge{value: 1e15}(999);
    }

    // -----------------------------------------------------------------------
    // 3. test_addBonus_raisesGuarantee
    //    Plus reverts: after deadline, zero value, unknown id.
    // -----------------------------------------------------------------------
    function test_addBonus_raisesGuarantee() public {
        uint256 extraBonus = 1e17;
        vm.prank(sponsor);
        pb.addBonus{value: extraBonus}(campaignId);

        Pledgeback.CampaignView[] memory views = pb.getCampaigns(campaignId, 1);
        uint256 expectedPool = ORG_BONUS + extraBonus;
        assertEq(views[0].bonusPool, expectedPool);

        // guaranteeBps = 10_000 + bonusPool * 10_000 / goal
        uint256 expectedBps = 10_000 + (expectedPool * 10_000) / GOAL;
        assertEq(views[0].guaranteeBps, expectedBps);

        // --- Revert: after deadline
        _expireCampaign();
        vm.prank(sponsor);
        vm.expectRevert(Pledgeback.CampaignClosed.selector);
        pb.addBonus{value: 1e15}(campaignId);

        // --- Revert: zero value (on a fresh campaign still active)
        Pledgeback pb2 = new Pledgeback();
        vm.deal(organizer, 10 ether);
        uint64 dl2 = uint64(block.timestamp + 1 days);
        vm.prank(organizer);
        uint256 id2 = pb2.create{value: 1e15}("T", "", GOAL, dl2);
        vm.prank(sponsor);
        vm.deal(sponsor, 10 ether);
        vm.expectRevert(Pledgeback.ZeroAmount.selector);
        pb2.addBonus{value: 0}(id2);

        // --- Revert: unknown id
        vm.prank(sponsor);
        vm.expectRevert(Pledgeback.UnknownCampaign.selector);
        pb2.addBonus{value: 1e15}(999);
    }

    // -----------------------------------------------------------------------
    // 4. test_success_organizerCollectsOnce
    // -----------------------------------------------------------------------
    function test_success_organizerCollectsOnce() public {
        uint256 pledge1 = 6e17;
        uint256 pledge2 = 5e17;

        vm.prank(backer1);
        pb.pledge{value: pledge1}(campaignId);
        vm.prank(backer2);
        pb.pledge{value: pledge2}(campaignId);

        _expireCampaign();

        uint256 before = organizer.balance;
        vm.prank(organizer);
        pb.collect(campaignId);
        uint256 collected = organizer.balance - before;

        assertEq(collected, pledge1 + pledge2);

        // Second collect reverts
        vm.prank(organizer);
        vm.expectRevert(Pledgeback.AlreadyClaimed.selector);
        pb.collect(campaignId);
    }

    // -----------------------------------------------------------------------
    // 5. test_success_sponsorsReclaimFullBonus
    // -----------------------------------------------------------------------
    function test_success_sponsorsReclaimFullBonus() public {
        // Add a second sponsor before pledging
        vm.prank(sponsor);
        pb.addBonus{value: SPO_BONUS}(campaignId);

        // Meet goal
        vm.prank(backer1);
        pb.pledge{value: GOAL}(campaignId);

        _expireCampaign();

        // Organizer contribution (from create) gets full refund on success
        uint256 beforeOrg = organizer.balance;
        vm.prank(organizer);
        pb.reclaimBonus(campaignId);
        assertEq(organizer.balance - beforeOrg, ORG_BONUS);

        // Sponsor gets full contribution back
        uint256 beforeSpo = sponsor.balance;
        vm.prank(sponsor);
        pb.reclaimBonus(campaignId);
        assertEq(sponsor.balance - beforeSpo, SPO_BONUS);
    }

    // -----------------------------------------------------------------------
    // 6. test_success_backerCannotClaimRefund
    // -----------------------------------------------------------------------
    function test_success_backerCannotClaimRefund() public {
        vm.prank(backer1);
        pb.pledge{value: GOAL}(campaignId);

        _expireCampaign();

        vm.prank(backer1);
        vm.expectRevert(Pledgeback.GoalMet.selector);
        pb.claimRefund(campaignId);
    }

    // -----------------------------------------------------------------------
    // 10. test_claimsRevertBeforeDeadline
    // -----------------------------------------------------------------------
    function test_claimsRevertBeforeDeadline() public {
        vm.prank(backer1);
        pb.pledge{value: 1e17}(campaignId);

        // collect
        vm.prank(organizer);
        vm.expectRevert(Pledgeback.CampaignOpen.selector);
        pb.collect(campaignId);

        // claimRefund
        vm.prank(backer1);
        vm.expectRevert(Pledgeback.CampaignOpen.selector);
        pb.claimRefund(campaignId);

        // reclaimBonus
        vm.prank(organizer);
        vm.expectRevert(Pledgeback.CampaignOpen.selector);
        pb.reclaimBonus(campaignId);
    }

    // -----------------------------------------------------------------------
    // 14. test_plainTransferReverts
    // -----------------------------------------------------------------------
    function test_plainTransferReverts() public {
        vm.prank(backer1);
        (bool ok,) = address(pb).call{value: 1 ether}("");
        assertFalse(ok, "plain transfer should revert");
    }

    // -----------------------------------------------------------------------
    // collect / claimRefund / reclaimBonus by wrong callers revert correctly.
    // -----------------------------------------------------------------------
    function test_wrongCaller_reverts() public {
        // --- collect by non-organizer on a succeeded campaign
        vm.prank(backer1);
        pb.pledge{value: GOAL}(campaignId);
        _expireCampaign();

        vm.prank(backer1);
        vm.expectRevert(Pledgeback.NotOrganizer.selector);
        pb.collect(campaignId);

        // --- claimRefund by non-backer on a failed campaign
        //     (create a fresh failed campaign; backer1 has no pledge)
        Pledgeback pb2 = new Pledgeback();
        vm.deal(organizer, 10 ether);
        uint64 dl = uint64(block.timestamp + 1 days);
        vm.prank(organizer);
        uint256 id2 = pb2.create{value: 1e15}("T", "", GOAL, dl);
        vm.warp(block.timestamp + 2 days);
        vm.prank(backer2);
        vm.expectRevert(Pledgeback.NothingToClaim.selector);
        pb2.claimRefund(id2);

        // --- reclaimBonus by non-sponsor on a failed campaign
        vm.prank(backer2);
        vm.expectRevert(Pledgeback.NothingToClaim.selector);
        pb2.reclaimBonus(id2);
    }

    // -----------------------------------------------------------------------
    // positionOf returns exact owed amounts in Campaign B before and after each
    // claim; getBackers / getSponsors return correct addresses and amounts with
    // paging.
    // -----------------------------------------------------------------------
    function test_positionOf_and_paging() public {
        // Campaign B setup: goal=1e18, orgBonus=5e16, spoBonus=5e16,
        //                   backer1=2e17, backer2=1e17
        vm.prank(sponsor);
        pb.addBonus{value: SPO_BONUS}(campaignId);

        vm.prank(backer1);
        pb.pledge{value: 2e17}(campaignId);
        vm.prank(backer2);
        pb.pledge{value: 1e17}(campaignId);

        // --- getBackers paging ---
        // offset=0, limit=1 → only backer1
        (address[] memory addrs, uint256[] memory amts) = pb.getBackers(campaignId, 0, 1);
        assertEq(addrs.length, 1);
        assertEq(addrs[0], backer1);
        assertEq(amts[0], 2e17);

        // offset=1, limit=10 → only backer2
        (addrs, amts) = pb.getBackers(campaignId, 1, 10);
        assertEq(addrs.length, 1);
        assertEq(addrs[0], backer2);
        assertEq(amts[0], 1e17);

        // offset=0, limit=10 → both backers
        (addrs, amts) = pb.getBackers(campaignId, 0, 10);
        assertEq(addrs.length, 2);

        // --- getSponsors paging ---
        // organizer is sponsor[0], extra sponsor is sponsor[1]
        (addrs, amts) = pb.getSponsors(campaignId, 0, 10);
        assertEq(addrs.length, 2);
        assertEq(addrs[0], organizer);
        assertEq(amts[0], ORG_BONUS);
        assertEq(addrs[1], sponsor);
        assertEq(amts[1], SPO_BONUS);

        // offset=1, limit=1 → only second sponsor
        (addrs, amts) = pb.getSponsors(campaignId, 1, 1);
        assertEq(addrs.length, 1);
        assertEq(addrs[0], sponsor);

        // --- positionOf before deadline ---
        // While active, owed amounts should be 0 (no claims possible)
        (
            uint256 pledgeAmt, uint256 bonusAmt,
            bool refundDone, bool bonusDone,
            uint256 refundOwed, uint256 bonusOwed, uint256 collectOwed
        ) = pb.positionOf(campaignId, backer1);
        assertEq(pledgeAmt, 2e17);
        assertEq(bonusAmt, 0);
        assertFalse(refundDone);
        assertFalse(bonusDone);
        assertEq(refundOwed, 0, "no refund owed while active");
        assertEq(bonusOwed, 0, "no bonus owed while active");
        assertEq(collectOwed, 0, "nothing collectable while active");

        // --- positionOf after failure ---
        _expireCampaign();
        // bonusPool = 1e17, goal = 1e18
        // backer1: pledge=2e17, bonus=2e17*1e17/1e18 = 2e16, total=22e16
        (pledgeAmt, bonusAmt, refundDone, bonusDone, refundOwed, bonusOwed, collectOwed) =
            pb.positionOf(campaignId, backer1);
        assertEq(pledgeAmt, 2e17);
        assertEq(refundOwed, 22e16, "backer1 refundOwed before claim");
        assertFalse(refundDone);

        // backer2: pledge=1e17, bonus=1e17*1e17/1e18 = 1e16, total=11e16
        (pledgeAmt,,, , refundOwed,,) = pb.positionOf(campaignId, backer2);
        assertEq(pledgeAmt, 1e17);
        assertEq(refundOwed, 11e16, "backer2 refundOwed before claim");

        // organizer: bonusAmt=5e16, bonusOwed=5e16*(1e18-3e17)/1e18 = 35e15
        (,bonusAmt,,,, bonusOwed,) = pb.positionOf(campaignId, organizer);
        assertEq(bonusAmt, ORG_BONUS);
        assertEq(bonusOwed, 35e15, "organizer bonusOwed");

        // --- positionOf after backer1 claims ---
        vm.prank(backer1);
        pb.claimRefund(campaignId);
        (,,refundDone,,refundOwed,,) = pb.positionOf(campaignId, backer1);
        assertTrue(refundDone, "refundDone after claim");
        assertEq(refundOwed, 0, "refundOwed after claim");
    }

    // -----------------------------------------------------------------------
    // Deadline boundary:
    //   pledge and addBonus succeed at deadline - 1 and revert at exactly deadline;
    //   claims revert at deadline - 1 and work at exactly deadline.
    // -----------------------------------------------------------------------
    function test_deadlineBoundary() public {
        // Campaign standard: DURATION = 7 days from setUp
        uint64 deadline = uint64(block.timestamp + DURATION);

        // --- At deadline - 1: pledge and addBonus still succeed ---
        vm.warp(deadline - 1);
        vm.prank(backer1);
        pb.pledge{value: 1e17}(campaignId);

        vm.prank(sponsor);
        pb.addBonus{value: 1e16}(campaignId);

        // --- At deadline - 1: claims must revert (still active) ---
        vm.prank(backer1);
        vm.expectRevert(Pledgeback.CampaignOpen.selector);
        pb.claimRefund(campaignId);

        vm.prank(organizer);
        vm.expectRevert(Pledgeback.CampaignOpen.selector);
        pb.reclaimBonus(campaignId);

        // --- At exactly deadline: pledge and addBonus revert (closed) ---
        vm.warp(deadline);
        vm.prank(backer2);
        vm.expectRevert(Pledgeback.CampaignClosed.selector);
        pb.pledge{value: 1e15}(campaignId);

        vm.prank(sponsor);
        vm.expectRevert(Pledgeback.CampaignClosed.selector);
        pb.addBonus{value: 1e15}(campaignId);

        // --- At exactly deadline: claimRefund works (pledged 1e17 < GOAL = 1e18) ---
        uint256 before = backer1.balance;
        vm.prank(backer1);
        pb.claimRefund(campaignId);
        assertGt(backer1.balance, before, "backer1 refund at deadline");

        // --- At exactly deadline: reclaimBonus works ---
        before = organizer.balance;
        vm.prank(organizer);
        pb.reclaimBonus(campaignId);
        assertGt(organizer.balance, before, "organizer reclaimBonus at deadline");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PledgebackTestBase} from "./Pledgeback.Base.t.sol";
import {Pledgeback} from "../Pledgeback.sol";

contract PledgebackFuzzTest is PledgebackTestBase {

    // -----------------------------------------------------------------------
    // testFuzz_conservation
    //
    // Covers:
    //   - 0..3 extra sponsors, bonus added after pledges
    //   - campaigns with no pledges
    //   - pledged exactly equal to goal (Succeeded path)
    //   - all claims made; totalOut <= totalIn
    //   - contract balance leftover equals summed rounding dust
    // -----------------------------------------------------------------------
    function testFuzz_conservation(
        uint256 goal,
        uint256 orgBonus,
        uint8   numPledgers,    // 0..5
        uint8   numSponsors,    // 0..3 extra sponsors
        bool    bonusAfterPledge,
        bool    pledgedEqualsGoal,
        uint256[5] memory pledgeAmts,
        uint256[3] memory sponsorAmts
    ) public {
        // --- Bound inputs ---
        goal         = bound(goal, 1e15, 1e30);
        orgBonus     = bound(orgBonus, 1e14, 1e20);
        numPledgers  = uint8(bound(numPledgers, 0, 5));
        numSponsors  = uint8(bound(numSponsors, 0, 3));

        // --- Build a fresh Pledgeback for this run ---
        Pledgeback fpb = new Pledgeback();

        address fOrg = makeAddr("fOrg");
        vm.deal(fOrg, orgBonus + 1 ether);

        uint64 deadline = uint64(block.timestamp + 1 days);
        vm.prank(fOrg);
        uint256 id = fpb.create{value: orgBonus}("FuzzTitle", "", goal, deadline);

        uint256 totalIn = orgBonus;

        // --- Extra sponsors (may be added before or after pledges) ---
        address[3] memory sponsors;
        sponsors[0] = makeAddr("fSpo0");
        sponsors[1] = makeAddr("fSpo1");
        sponsors[2] = makeAddr("fSpo2");

        uint256[3] memory sponsorContribs;
        for (uint8 s = 0; s < numSponsors; ++s) {
            sponsorContribs[s] = bound(sponsorAmts[s], 1e14, 1e20);
        }

        // Add sponsors BEFORE pledges unless bonusAfterPledge is true
        if (!bonusAfterPledge) {
            for (uint8 s = 0; s < numSponsors; ++s) {
                vm.deal(sponsors[s], sponsorContribs[s] + 1 ether);
                vm.prank(sponsors[s]);
                fpb.addBonus{value: sponsorContribs[s]}(id);
                totalIn += sponsorContribs[s];
            }
        }

        // --- Pledgers ---
        address[5] memory pledgers;
        pledgers[0] = makeAddr("fp0");
        pledgers[1] = makeAddr("fp1");
        pledgers[2] = makeAddr("fp2");
        pledgers[3] = makeAddr("fp3");
        pledgers[4] = makeAddr("fp4");

        uint256 totalPledged;

        if (numPledgers > 0) {
            if (pledgedEqualsGoal) {
                // Split the goal exactly among numPledgers, giving remainder to last pledger
                uint256 share = goal / numPledgers;
                uint256 remainder = goal - share * (numPledgers - 1);
                for (uint8 i = 0; i < numPledgers; ++i) {
                    uint256 amt = (i == numPledgers - 1) ? remainder : share;
                    if (amt == 0) amt = 1; // ensure nonzero
                    vm.deal(pledgers[i], amt + 1 ether);
                    vm.prank(pledgers[i]);
                    fpb.pledge{value: amt}(id);
                    totalPledged += amt;
                    totalIn += amt;
                }
            } else {
                for (uint8 i = 0; i < numPledgers; ++i) {
                    uint256 amt = bound(pledgeAmts[i], 1e14, 2e20);
                    vm.deal(pledgers[i], amt + 1 ether);
                    vm.prank(pledgers[i]);
                    fpb.pledge{value: amt}(id);
                    totalPledged += amt;
                    totalIn += amt;
                }
            }
        }
        // numPledgers == 0: no pledges (campaign will fail regardless of goal)

        // Add sponsors AFTER pledges when bonusAfterPledge is true
        if (bonusAfterPledge) {
            for (uint8 s = 0; s < numSponsors; ++s) {
                vm.deal(sponsors[s], sponsorContribs[s] + 1 ether);
                vm.prank(sponsors[s]);
                fpb.addBonus{value: sponsorContribs[s]}(id);
                totalIn += sponsorContribs[s];
            }
        }

        // --- Warp past deadline ---
        vm.warp(block.timestamp + 2 days);

        uint8 st = fpb.status(id);
        uint256 totalOut;
        uint256 numClaims;

        if (st == 1) {
            // ------ Succeeded ------

            // Organizer collects pledges
            uint256 before = fOrg.balance;
            vm.prank(fOrg);
            fpb.collect(id);
            totalOut += fOrg.balance - before;
            numClaims++;

            // Organizer reclaims its bonus (full, on success)
            before = fOrg.balance;
            vm.prank(fOrg);
            fpb.reclaimBonus(id);
            totalOut += fOrg.balance - before;
            numClaims++;

            // Extra sponsors reclaim full bonuses
            for (uint8 s = 0; s < numSponsors; ++s) {
                before = sponsors[s].balance;
                vm.prank(sponsors[s]);
                fpb.reclaimBonus(id);
                totalOut += sponsors[s].balance - before;
                numClaims++;
            }

        } else {
            // ------ Failed ------

            // All backers claim refunds
            for (uint8 i = 0; i < numPledgers; ++i) {
                uint256 before = pledgers[i].balance;
                vm.prank(pledgers[i]);
                fpb.claimRefund(id);
                totalOut += pledgers[i].balance - before;
                numClaims++;
            }

            // Organizer reclaims remaining bonus share
            uint256 orgBefore = fOrg.balance;
            vm.prank(fOrg);
            fpb.reclaimBonus(id);
            totalOut += fOrg.balance - orgBefore;
            numClaims++;

            // Extra sponsors reclaim their remaining shares
            for (uint8 s = 0; s < numSponsors; ++s) {
                uint256 before = sponsors[s].balance;
                vm.prank(sponsors[s]);
                fpb.reclaimBonus(id);
                totalOut += sponsors[s].balance - before;
                numClaims++;
            }
        }

        // --- Conservation invariants ---

        // 1. Total out never exceeds total in
        assertLe(totalOut, totalIn, "totalOut > totalIn");

        // 2. Rounding dust is at most one wei per claim (one integer division per claim)
        uint256 dust = totalIn - totalOut;
        assertLe(dust, numClaims, "dust exceeds numClaims wei");

        // 3. Contract balance leftover equals exactly the summed rounding dust
        assertEq(address(fpb).balance, dust, "contract leftover != computed dust");
    }
}

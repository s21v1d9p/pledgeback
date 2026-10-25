// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Pledgeback} from "../Pledgeback.sol";

// ---------------------------------------------------------------------------
// Helper: ReentrantAttacker
//   receive() re-enters claimRefund once, then reclaimBonus once.
// ---------------------------------------------------------------------------
contract ReentrantAttacker {
    Pledgeback public pb;
    uint256 public campaignId;
    address public owner;
    bool private _entered;

    constructor(address _pb, uint256 _id, address _owner) {
        pb = Pledgeback(_pb);
        campaignId = _id;
        owner = _owner;
    }

    function attack() external {
        pb.claimRefund(campaignId);
    }

    receive() external payable {
        if (!_entered) {
            _entered = true;
            // Try to double-claim inside the callback — both should revert
            try pb.claimRefund(campaignId) {} catch {}
            try pb.reclaimBonus(campaignId) {} catch {}
        }
    }

    function withdraw() external {
        (bool ok,) = payable(owner).call{value: address(this).balance}("");
        require(ok, "withdraw failed");
    }
}

// ---------------------------------------------------------------------------
// Helper: RejectingReceiver
//   receive() reverts unconditionally (simulates a contract that cannot
//   accept ETH).
// ---------------------------------------------------------------------------
contract RejectingReceiver {
    function pledge(Pledgeback pb, uint256 id) external payable {
        pb.pledge{value: msg.value}(id);
    }

    function claimRefund(Pledgeback pb, uint256 id) external {
        pb.claimRefund(id);
    }

    receive() external payable {
        revert("I reject ETH");
    }
}

// ---------------------------------------------------------------------------
// Shared base — setUp creates a fresh Pledgeback and a standard campaign.
// ---------------------------------------------------------------------------
abstract contract PledgebackTestBase is Test {
    Pledgeback internal pb;

    // Labelled test addresses
    address internal organizer = makeAddr("organizer");
    address internal sponsor   = makeAddr("sponsor");
    address internal backer1   = makeAddr("backer1");
    address internal backer2   = makeAddr("backer2");
    address internal backer3   = makeAddr("backer3");

    // Standard campaign parameters
    uint256 internal constant GOAL        = 1e18;   // 1 USDC (18 dec)
    uint256 internal constant ORG_BONUS   = 5e16;   // 0.05 USDC
    uint256 internal constant SPO_BONUS   = 5e16;   // 0.05 USDC
    string  internal constant TITLE       = "Test Campaign";
    string  internal constant LINK        = "https://example.com";
    uint64  internal constant DURATION    = 7 days;

    uint256 internal campaignId;

    function setUp() public virtual {
        pb = new Pledgeback();

        // Give all actors ample ETH
        vm.deal(organizer, 100 ether);
        vm.deal(sponsor,   100 ether);
        vm.deal(backer1,   100 ether);
        vm.deal(backer2,   100 ether);
        vm.deal(backer3,   100 ether);

        // Create the standard campaign
        uint64 deadline = uint64(block.timestamp + DURATION);
        vm.prank(organizer);
        campaignId = pb.create{value: ORG_BONUS}(TITLE, LINK, GOAL, deadline);
    }

    // Convenience: warp past the campaign deadline
    function _expireCampaign() internal {
        vm.warp(block.timestamp + DURATION + 1);
    }
}

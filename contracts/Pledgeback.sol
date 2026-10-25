// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Pledgeback
/// @notice Campaign crowdfunding with sponsor-backed failure refunds and no privileged roles.
/// @dev Native USDC is represented by msg.value (18 decimals on Arc).
contract Pledgeback is ReentrancyGuard {
    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error UnknownCampaign();
    error CampaignClosed();
    error CampaignOpen();
    error GoalMet();
    error GoalNotMet();
    error NotOrganizer();
    error NothingToClaim();
    error AlreadyClaimed();
    error InvalidGoal();
    error InvalidDeadline();
    error InvalidText();
    error ZeroAmount();
    error TransferFailed();

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint256 private constant _MIN_DEADLINE_DELTA = 10 minutes;
    uint256 private constant _MAX_DEADLINE_DELTA = 180 days;

    uint8 private constant _STATUS_ACTIVE = 0;
    uint8 private constant _STATUS_SUCCEEDED = 1;
    uint8 private constant _STATUS_FAILED = 2;

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    struct Campaign {
        address organizer;
        uint64 deadline; // unix seconds
        bool collected; // organizer collected after success
        uint256 goal; // wei of native USDC
        uint256 pledged; // total pledged
        uint256 bonusPool; // organizer bonus + sponsor additions
        string title; // 1..80 bytes
        string link; // 0..200 bytes
    }

    struct CampaignView {
        uint256 id;
        address organizer;
        string title;
        string link;
        uint256 goal;
        uint256 pledged;
        uint256 bonusPool;
        uint64 deadline;
        bool collected;
        uint8 status;
        uint256 backerCount;
        uint256 sponsorCount;
        uint256 guaranteeBps;
    }

    /// @dev Campaign ids start at 1. This tracks the highest id.
    uint256 private _campaignCount;

    mapping(uint256 => Campaign) private _campaigns;

    mapping(uint256 => mapping(address => uint256)) public pledgeOf;
    mapping(uint256 => mapping(address => uint256)) public bonusOf;
    mapping(uint256 => mapping(address => bool)) public refunded;
    mapping(uint256 => mapping(address => bool)) public bonusReclaimed;

    /// @dev Append-only display lists.
    mapping(uint256 => address[]) private _backers;
    mapping(uint256 => address[]) private _sponsors;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event CampaignCreated(
        uint256 indexed id,
        address indexed organizer,
        uint256 goal,
        uint64 deadline,
        uint256 startingBonus,
        string title,
        string link
    );

    event Pledged(
        uint256 indexed id,
        address indexed backer,
        uint256 amount,
        uint256 backerTotal,
        uint256 campaignTotal
    );

    event BonusAdded(uint256 indexed id, address indexed sponsor, uint256 amount, uint256 bonusPool);
    event Collected(uint256 indexed id, address indexed organizer, uint256 amount);
    event Refunded(uint256 indexed id, address indexed backer, uint256 pledge, uint256 bonus);
    event BonusReclaimed(uint256 indexed id, address indexed sponsor, uint256 amount);

    // -------------------------------------------------------------------------
    // Write functions
    // -------------------------------------------------------------------------

    /// @notice Create a campaign with an organizer-funded starting bonus.
    function create(
        string calldata title,
        string calldata link,
        uint256 goal,
        uint64 deadline
    ) external payable returns (uint256 id) {
        if (msg.value == 0) revert ZeroAmount();
        if (goal == 0 || goal > 1e30) revert InvalidGoal();

        uint256 nowTs = block.timestamp;
        if (deadline < nowTs + _MIN_DEADLINE_DELTA || deadline > nowTs + _MAX_DEADLINE_DELTA) {
            revert InvalidDeadline();
        }

        uint256 titleLen = bytes(title).length;
        uint256 linkLen = bytes(link).length;
        if (titleLen == 0 || titleLen > 80 || linkLen > 200) revert InvalidText();

        id = ++_campaignCount;
        Campaign storage c = _campaigns[id];
        c.organizer = msg.sender;
        c.deadline = deadline;
        c.goal = goal;
        c.bonusPool = msg.value;
        c.title = title;
        c.link = link;

        bonusOf[id][msg.sender] = msg.value;
        _sponsors[id].push(msg.sender);

        emit CampaignCreated(id, msg.sender, goal, deadline, msg.value, title, link);
    }

    /// @notice Pledge native USDC to an active campaign.
    function pledge(uint256 id) external payable {
        Campaign storage c = _campaignOrRevert(id);
        if (_statusOf(c) != _STATUS_ACTIVE) revert CampaignClosed();
        if (msg.value == 0) revert ZeroAmount();

        uint256 prevPledge = pledgeOf[id][msg.sender];
        if (prevPledge == 0) {
            _backers[id].push(msg.sender);
        }

        uint256 newBackerTotal = prevPledge + msg.value;
        pledgeOf[id][msg.sender] = newBackerTotal;
        c.pledged += msg.value;

        emit Pledged(id, msg.sender, msg.value, newBackerTotal, c.pledged);
    }

    /// @notice Add sponsor bonus funds to an active campaign.
    function addBonus(uint256 id) external payable {
        Campaign storage c = _campaignOrRevert(id);
        if (_statusOf(c) != _STATUS_ACTIVE) revert CampaignClosed();
        if (msg.value == 0) revert ZeroAmount();

        uint256 prevBonus = bonusOf[id][msg.sender];
        if (prevBonus == 0) {
            _sponsors[id].push(msg.sender);
        }

        bonusOf[id][msg.sender] = prevBonus + msg.value;
        c.bonusPool += msg.value;

        emit BonusAdded(id, msg.sender, msg.value, c.bonusPool);
    }

    /// @notice Organizer collects pledged funds after a successful campaign.
    function collect(uint256 id) external nonReentrant {
        Campaign storage c = _campaignOrRevert(id);

        uint8 st = _statusOf(c);
        if (st == _STATUS_ACTIVE) revert CampaignOpen();
        if (st == _STATUS_FAILED) revert GoalNotMet();

        if (msg.sender != c.organizer) revert NotOrganizer();
        if (c.collected) revert AlreadyClaimed();

        uint256 amount = c.pledged;
        c.collected = true;

        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit Collected(id, msg.sender, amount);
    }

    /// @notice Backer claims failure refund plus pro-rata bonus.
    function claimRefund(uint256 id) external nonReentrant {
        Campaign storage c = _campaignOrRevert(id);

        uint8 st = _statusOf(c);
        if (st == _STATUS_ACTIVE) revert CampaignOpen();
        if (st == _STATUS_SUCCEEDED) revert GoalMet();

        uint256 pledgeAmount = pledgeOf[id][msg.sender];
        if (pledgeAmount == 0) revert NothingToClaim();
        if (refunded[id][msg.sender]) revert AlreadyClaimed();

        uint256 bonusAmount = (pledgeAmount * c.bonusPool) / c.goal;
        uint256 payout = pledgeAmount + bonusAmount;

        refunded[id][msg.sender] = true;

        (bool ok,) = payable(msg.sender).call{value: payout}("");
        if (!ok) revert TransferFailed();

        emit Refunded(id, msg.sender, pledgeAmount, bonusAmount);
    }

    /// @notice Sponsor reclaims bonus contribution after campaign resolution.
    function reclaimBonus(uint256 id) external nonReentrant {
        Campaign storage c = _campaignOrRevert(id);

        uint8 st = _statusOf(c);
        if (st == _STATUS_ACTIVE) revert CampaignOpen();

        uint256 contribution = bonusOf[id][msg.sender];
        if (contribution == 0) revert NothingToClaim();
        if (bonusReclaimed[id][msg.sender]) revert AlreadyClaimed();

        uint256 amount;
        if (st == _STATUS_SUCCEEDED) {
            amount = contribution;
        } else {
            // Failed path: contribution * (goal - pledged) / goal.
            amount = (contribution * (c.goal - c.pledged)) / c.goal;
        }

        bonusReclaimed[id][msg.sender] = true;

        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit BonusReclaimed(id, msg.sender, amount);
    }

    // -------------------------------------------------------------------------
    // Read functions
    // -------------------------------------------------------------------------

    /// @notice Highest created campaign id. Campaign ids start at 1.
    function campaignCount() external view returns (uint256) {
        return _campaignCount;
    }

    /// @notice Campaign status: 0 Active, 1 Succeeded, 2 Failed.
    function status(uint256 id) external view returns (uint8) {
        Campaign storage c = _campaignOrRevert(id);
        return _statusOf(c);
    }

    /// @notice Paginated campaign list for ids [startId, startId + limit - 1], capped by campaignCount.
    function getCampaigns(uint256 startId, uint256 limit) external view returns (CampaignView[] memory out) {
        uint256 count = _campaignCount;
        if (startId == 0 || startId > count || limit == 0) {
            return new CampaignView[](0);
        }

        uint256 endExclusive;
        unchecked {
            endExclusive = startId + limit;
            if (endExclusive < startId) {
                // Overflow means "to max uint256", effectively capped to count below.
                endExclusive = type(uint256).max;
            }
        }

        uint256 cappedEndExclusive = endExclusive;
        if (cappedEndExclusive > count + 1) {
            cappedEndExclusive = count + 1;
        }

        uint256 len = cappedEndExclusive - startId;
        out = new CampaignView[](len);

        for (uint256 i = 0; i < len; ++i) {
            uint256 id = startId + i;
            Campaign storage c = _campaigns[id];

            out[i] = CampaignView({
                id: id,
                organizer: c.organizer,
                title: c.title,
                link: c.link,
                goal: c.goal,
                pledged: c.pledged,
                bonusPool: c.bonusPool,
                deadline: c.deadline,
                collected: c.collected,
                status: _statusOf(c),
                backerCount: _backers[id].length,
                sponsorCount: _sponsors[id].length,
                guaranteeBps: 10_000 + ((c.bonusPool * 10_000) / c.goal)
            });
        }
    }

    /// @notice Paginated backer addresses and their pledge amounts for a campaign.
    function getBackers(
        uint256 id,
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory addrs, uint256[] memory amounts) {
        _campaignOrRevert(id);
        address[] storage arr = _backers[id];
        return _slicePositions(id, arr, offset, limit, true);
    }

    /// @notice Paginated sponsor addresses and their bonus contribution amounts for a campaign.
    function getSponsors(
        uint256 id,
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory addrs, uint256[] memory amounts) {
        _campaignOrRevert(id);
        address[] storage arr = _sponsors[id];
        return _slicePositions(id, arr, offset, limit, false);
    }

    /// @notice Per-address campaign position and currently claimable amounts.
    function positionOf(
        uint256 id,
        address who
    )
        external
        view
        returns (
            uint256 pledgeAmt,
            uint256 bonusAmt,
            bool refundDone,
            bool bonusDone,
            uint256 refundOwed,
            uint256 bonusOwed,
            uint256 collectOwed
        )
    {
        Campaign storage c = _campaignOrRevert(id);
        uint8 st = _statusOf(c);

        pledgeAmt = pledgeOf[id][who];
        bonusAmt = bonusOf[id][who];
        refundDone = refunded[id][who];
        bonusDone = bonusReclaimed[id][who];

        uint256 p = pledgeAmt;
        if (st == _STATUS_FAILED && p > 0 && !refundDone) {
            refundOwed = p + ((p * c.bonusPool) / c.goal);
        }

        uint256 b = bonusAmt;
        if (b > 0 && !bonusDone) {
            if (st == _STATUS_SUCCEEDED) {
                bonusOwed = b;
            } else if (st == _STATUS_FAILED) {
                bonusOwed = (b * (c.goal - c.pledged)) / c.goal;
            }
        }

        if (st == _STATUS_SUCCEEDED && who == c.organizer && !c.collected) {
            collectOwed = c.pledged;
        }
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    function _campaignOrRevert(uint256 id) internal view returns (Campaign storage c) {
        if (id == 0 || id > _campaignCount) revert UnknownCampaign();
        c = _campaigns[id];
    }

    function _statusOf(Campaign storage c) internal view returns (uint8) {
        if (block.timestamp < c.deadline) {
            return _STATUS_ACTIVE;
        }
        return c.pledged >= c.goal ? _STATUS_SUCCEEDED : _STATUS_FAILED;
    }

    function _slicePositions(
        uint256 id,
        address[] storage arr,
        uint256 offset,
        uint256 limit,
        bool isBacker
    ) internal view returns (address[] memory addrs, uint256[] memory amounts) {
        uint256 n = arr.length;
        if (offset >= n || limit == 0) {
            return (new address[](0), new uint256[](0));
        }

        uint256 end;
        unchecked {
            end = offset + limit;
            if (end < offset) {
                end = type(uint256).max;
            }
        }
        if (end > n) end = n;

        uint256 len = end - offset;
        addrs = new address[](len);
        amounts = new uint256[](len);

        for (uint256 i = 0; i < len; ++i) {
            address who = arr[offset + i];
            addrs[i] = who;
            amounts[i] = isBacker ? pledgeOf[id][who] : bonusOf[id][who];
        }
    }
}

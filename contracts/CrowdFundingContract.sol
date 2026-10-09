// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "contracts/BlockAccount.sol";

// Creating the smart contract
contract CrowdFunding {
    // Payable because all the funds will go to the fund manager and when the
    // fund ticket is about to close all the money will go to the fund raiser block.
    //
    // UNIT CONVENTION: every amount in this contract (fund_amount,
    // current_collection, donations, releases) is denominated in **wei**.
    // The frontend converts ETH to wei with ethers.parseEther() before calling.
    address payable public fund_manager; // Contract admin

    FundTicket public ticket; // Public so that the donor can see which ticket is active and its details

    // Mappings for registration..
    uint public donor_index;
    uint public fundraiser_index;

    mapping(uint => Fundraiser) fundraiserList;
    mapping(uint => Donor) donorList;

    // O(1) existence checks (the old modifiers walked the lists with a broken flag)
    mapping(address => bool) public isFundraiser;
    mapping(address => bool) public isDonor;

    // True once the collected funds of the current ticket were released
    bool public funds_released;

    // Simple re-entrancy lock for the functions that move ether
    bool private locked;

    // Events so the frontend can react to on-chain activity
    event FundraiserRegistered(address indexed account, string name);
    event DonorRegistered(address indexed account, string name);
    event FundTicketRaised(address indexed fundraiser, string title, uint fundAmount);
    event DonationReceived(address indexed donor, uint amount, uint totalCollected);
    event FundTicketCapped(uint totalCollected);
    event FundsReleased(address indexed fundraiser, uint amount);

    constructor() {
        fund_manager = payable(msg.sender);
    }

    // Modifiers
    modifier CheckFundManager() {
        require(
            msg.sender == fund_manager,
            "Action Deny... Invalid User Account"
        );
        _;
    }

    modifier CheckFundRaiser() {
        require(!isFundraiser[msg.sender], "Fundraiser account exist....");
        _;
    }

    modifier CheckDonorRegister() {
        require(!isDonor[msg.sender], "Donor account exist....");
        _;
    }

    modifier IsFundraiserRegisterExists() {
        require(
            isFundraiser[msg.sender],
            "Fundraiser account does not exist...."
        );
        _;
    }

    modifier IsDonorRegisterExists() {
        require(isDonor[msg.sender], "Donor account does not exist....");
        _;
    }

    // A new ticket can only be raised while no ticket is active
    // (a finished/released ticket does not block the next one)
    modifier CheckFundTicketStatus() {
        require(
            ticket.active_status == false,
            "Crowd Funding Ticket already exist..."
        );
        _;
    }

    modifier IsFundTicketExists() {
        require(
            ticket.active_status == true,
            "Crowd Funding Ticket does not exist..."
        );
        _;
    }

    modifier CheckDonateAmount(uint weiAmount) {
        require(weiAmount > 0, "Invalid Amount, please donate more than 0...");
        require(
            weiAmount == msg.value,
            "Invalid Amount, please check the donation amount..."
        );
        _;
    }

    modifier CheckReleaseFundAmount() {
        require(
            msg.value == ticket.current_collection,
            "Invalid amount, please check the fund release amount..."
        );
        _;
    }

    modifier NonReentrant() {
        require(!locked, "Reentrancy detected");
        locked = true;
        _;
        locked = false;
    }

    // All the functions required for the smart contract
    function FundRaiserRegister(
        string memory name,
        string memory user_id_card
    ) public CheckFundRaiser() {
        // Initialize the fundraiser object
        fundraiserList[fundraiser_index] = Fundraiser(
            name,
            payable(msg.sender),
            user_id_card
        );
        isFundraiser[msg.sender] = true;
        fundraiser_index++;
        emit FundraiserRegistered(msg.sender, name);
    }

    function DonorRegister(
        string memory name,
        string memory userIdCard
    ) public CheckDonorRegister() {
        // Initialize the donor object
        donorList[donor_index] = Donor(name, payable(msg.sender), userIdCard);
        isDonor[msg.sender] = true;
        donor_index++;
        emit DonorRegistered(msg.sender, name);
    }

    function RaiseFundTicket(
        string memory title,
        string memory details,
        uint fund_amount
    ) public CheckFundTicketStatus() IsFundraiserRegisterExists() {
        require(fund_amount > 0, "Fund amount must be greater than zero");
        ticket = FundTicket(
            title,
            details,
            true,
            fund_amount,
            0,
            payable(msg.sender)
        );
        funds_released = false;
        emit FundTicketRaised(msg.sender, title, fund_amount);
    }

    function DonateNow(uint wei_amount)
        public
        payable
        IsFundTicketExists()
        IsDonorRegisterExists()
        CheckDonateAmount(wei_amount)
        NonReentrant()
    {
        ticket.current_collection += wei_amount;

        emit DonationReceived(msg.sender, wei_amount, ticket.current_collection);

        // Close the ticket as soon as the goal is reached
        if (
            ticket.fund_amount <= ticket.current_collection &&
            ticket.active_status
        ) {
            ticket.active_status = false;
            emit FundTicketCapped(ticket.current_collection);
        }

        // Forward the donation to the fund manager (checks-effects-interactions)
        (bool sent, ) = fund_manager.call{value: msg.value}("");
        require(sent, "Donation transfer to fund manager failed");
    }

    function ReleaseFundAmount()
        public
        payable
        CheckFundManager()
        IsFundTicketExists()
        CheckReleaseFundAmount()
        NonReentrant()
    {
        address payable raiser = ticket.fundraiser_address;
        uint amount = ticket.current_collection;

        funds_released = true;
        ticket.active_status = false;

        (bool sent, ) = raiser.call{value: msg.value}("");
        require(sent, "Fund release transfer to fundraiser failed");

        emit FundsReleased(raiser, amount);
    }

    // Read-only helpers used by the frontend
    function getFundraiserCount() external view returns (uint) {
        return fundraiser_index;
    }

    function getDonorCount() external view returns (uint) {
        return donor_index;
    }

    function getFundraiser(uint index)
        external
        view
        returns (string memory name, address addr, string memory id_card)
    {
        require(index < fundraiser_index, "Invalid fundraiser index");
        Fundraiser storage f = fundraiserList[index];
        return (f.name, f.raiser_address, f.raiser_id_card);
    }

    function getDonor(uint index)
        external
        view
        returns (string memory name, address addr, string memory id_card)
    {
        require(index < donor_index, "Invalid donor index");
        Donor storage d = donorList[index];
        return (d.name, d.donor_address, d.donor_id_card);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "contracts/BlockAccount.sol";

// Creating the smart contract
contract CrowdFunding {
    // Payble because all the funds will go to the fund manager and when the fund ticket is about to close
    // all the money will go to the fund raiser block
    address payable fund_manager; // Contract admin

    Fundraiser fundraiserBlock;
    Donor donorBlock;
    FundTicket public ticket; // Public so that the donor can see which ticket is active and its details

    // Mapping for registration..
    uint donor_index;
    uint fundraiser_index;

    mapping(uint => Fundraiser) fundraiserList;
    mapping(uint => Donor) donorList;

    constructor() payable {
        fund_manager = payable(msg.sender);
        fundraiser_index = 0;
        donor_index = 0;
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
        Fundraiser memory user_block;
        bool token = false;
        uint regcount = 0;

        while(regcount < fundraiser_index){
            if(fundraiserList[regcount].raiser_address == msg.sender) {
                token = false;
                break;
            }
            regcount++;
        }

        require(token == false, "Fundraiser account exist....");
        _;
    }

    modifier CheckDonorRegister() {
        Fundraiser memory user_block;
        bool token = false;
        uint regcount = 0;

        while(regcount < donor_index){
            if(donorList[regcount].donor_address == msg.sender) {
                token = false;
                break;
            }
            regcount++;
        }

        require(token == false, "Donor account exist....");
        _;
    }

    modifier IsFundraiserRegisterExists() {
        Fundraiser memory user_block;
        bool token = false;
        uint regcount = 0;

        while(regcount < fundraiser_index){
            if(fundraiserList[regcount].raiser_address == msg.sender) {
                token = false;
                break;
            }
            regcount++;
        }

        require(token == true, "Fundraiser account does not exist....");
        _;
    }

    modifier CheckFundTicketStatus() {
        require(ticket.active_status == false, "Crowd Funding Ticket already exist...");
        _;
    }

    modifier IsDonorRegisterExists() {
        Fundraiser memory user_block;
        bool token = false;
        uint regcount = 0;

        while(regcount < donor_index){
            if(donorList[regcount].donor_address == msg.sender) {
                token = false;
                break;
            }
            regcount++;
        }

        require(token == true, "Donor account does not exist....");
        _;
    }

    modifier IsFundTicketExists() {
        require(ticket.active_status == true, "Crowd Funding Ticket does not exist...");
        _;
    }

    modifier CheckDonateAmount(uint ethAmount) {
        uint amount = ethAmount * 1000000000000000000; // eth to wei converter 
        require(ethAmount == msg.value, "Invalid Amount, please check the donation amount...");
        _;
    }

    modifier CheckReleaseFundAmount() {
        uint amount = ticket.current_collection * 1000000000000000000; // eth to wei
        require(amount == msg.value, "Invalid amount, please check the fund release amount...");
        _;
    }

    // All the functions required for the smart contract
    function FundRaiserRegister(
        string memory name,
        string memory user_id_card
    ) public payable CheckFundRaiser() {
        // Initialize the funraiser object
        fundraiserBlock = Fundraiser(name, payable(msg.sender), user_id_card);
        fundraiserList[fundraiser_index] = fundraiserBlock;
        fundraiser_index++;
    }

    function DonorRegister(
        string memory name,
        string memory userIdCard
    ) public payable CheckDonorRegister() {
        // Initialize the donor object
        donorBlock = Donor(name, payable(msg.sender), userIdCard);
        donorList[donor_index] = donorBlock;
        donor_index++;
    }

    function RaiseFundTicket(
        string memory title,
        string memory details,
        uint fund_amount
    ) public payable CheckFundTicketStatus() IsFundraiserRegisterExists() {
        ticket = FundTicket(
            title,
            details,
            true,
            fund_amount,
            0,
            payable(msg.sender)
        );
    }

    function DonateNow(uint eth_amount) public payable IsFundTicketExists() IsDonorRegisterExists() CheckDonateAmount(eth_amount){
        uint current_funds = ticket.current_collection;
        current_funds += eth_amount;
        fund_manager.transfer(msg.value);

        ticket.current_collection = current_funds;

        if (ticket.fund_amount <= ticket.current_collection) {
            ticket.active_status = false;
        }
    }

    function ReleaseFundAmount() public payable CheckFundManager() CheckReleaseFundAmount() {
        ticket.fundraiser_address.transfer(msg.value);
        ticket.active_status = false;
    }
}

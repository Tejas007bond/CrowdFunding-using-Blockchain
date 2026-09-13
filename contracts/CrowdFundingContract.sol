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
    mapping (uint => Donor) donorList;

    constructor() payable {
        fund_manager = payable(msg.sender);
        fundraiser_index = 0;
        donor_index = 0;
    }
}

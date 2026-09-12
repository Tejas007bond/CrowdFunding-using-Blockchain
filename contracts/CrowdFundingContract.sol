// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "contracts/BlockAccount.sol";

// Creating the smart contract 
contract CrowdFunding {
    Fundraiser fundraiserBlock;
    Donor donorBlock;
    FundTicket public ticket; // Public so that the donor can see which ticket is active and its details
}

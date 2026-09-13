// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

// A structure to define the fundraiser 
struct Fundraiser {
    string name;
    address payable raiser_address; // Address type that can receive ether
    string raiser_id_card; // Id card so that the user can be verified
}

// A structure to define the fundraiser
struct Donor {
    string name;
    address payable donor_address; // Address type that can send ether
    string donor_id_card; // Id card so the user can be verified
}

// A structure to create tickets/campaigns
struct FundTicket {
    string title;
    string details;
    bool active_status;
    uint fund_amount;
    uint current_collection;
    address payable fundraiser_address;
}
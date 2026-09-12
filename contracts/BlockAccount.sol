// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

struct Fundraiser {
    string name;
    address payable raiser_address;
    string raiser_id_card;
}

struct Donor {
    string name;
    address payable donor_address;
    string donor_id_card;
}

struct FundTicket {
    string title;
    string details;
    bool active_status;
    uint fund_amount;
    uint current_collection;
}
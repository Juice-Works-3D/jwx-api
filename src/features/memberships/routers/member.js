// This file contains all endpoints regarding Members
// Author: Daniel Manley

// requirements
require("dotenv").config({ path: ".env" });
const express = require("express");
const router = express.Router();
const axios = require("axios");
const Member = require("../models/member");
const { Query } = require("firefose");
const Account = require("../models/account");

// The end point creates new members and either associates them with
// an existing account or calls POST /account to create a new account.
// We also send a welcome email from this endpoint.
router.post("/member", async (req, res) => {
	try {
		// Sanitize the request
		const memberData = {
			first: req.body.memberFirst,
			last: req.body.memberLast,
			born: new Date(req.body.born),
			renewDate: Date.now(),
		};

		// Check if account with the given email exists
		var memberAccounts = await Account.find(
			new Query().where("email", "==", req.body.email)
		);

		if (memberAccounts.length === 0) {
			console.log("No account found with that email.");

			res
				.status(401)
				.send(
					"No account found with that email. " +
						"If this is an error, please contact system administator."
				);
			return;
			// If account does not exist, create a new one
			// const newAccountData = {
			// 	email: req.body.email,
			// 	phone: req.body.phone,
			// 	first: req.body.accountFirst,
			// 	last: req.body.accountLast,
			// };
			// memberAccounts[0] = await axios.post(
			// 	process.env.BASE_URL + "/account",
			// 	newAccountData
			// );
			// memberAccounts[0] = memberAccounts[0].data;
			// console.log(
			// 	"New account created for email:",
			// 	memberAccounts[0].email
			// );
		}

		if(memberAccounts[0].credits <= 0) {
			res
				.status(401)
				.send(
					"No member account credits." +
						"If this is an error, please contact system administator."
				);
			return;
		}

		// Assuming there have not been any errors, you can now create the
		// new member
		const newMember = await Member.create(memberData);
		console.log("New member created:", newMember);

		if (req.body.activate) {
			// Activate their membership
			await axios.patch(
				process.env.BASE_URL + "/member/activate/?id=" + newMember.id
			);
		}

		console.log("Member added to existing account:", memberAccounts);

		memberAccounts[0].members.push(newMember.id);

		// update the associated account to include this
		// new membership
		await axios.post(process.env.BASE_URL + "/account/member", {
			id: memberAccounts[0].id,
			members: memberAccounts[0].members,
			credits: memberAccounts[0].credits - 1,
		});

		// Return a 201 (Created) status if successful.
		res.status(201).send(newMember);
	} catch (e) {
		// Return a 400 (Bad Request) for any failure.
		console.error("Error in /member endpoint:", e);
		res.status(400).send({ error: e.message });
	}
});

// This endpoint gets the member specified within the
// request's queries. (example: https://localhost:3000/member?id=12345678)
router.get("/member", async (req, res) => {
	try {
		const data = await Member.findById(req.query.id);

		// Return a 400 (Bad Request) if no user exists with
		// the provided id
		if (data == null) {
			res.status(400).send("No such user exists.");
			return;
		}

		// Return a 200 (OK) status if a member was found by that Id.
		res.status(200).send(data);
	} catch (e) {
		// Return a 400 (Bad Request) for any failure.
		res.status(400).send({ error: e.message });
	}
});

// This endpoint returns a list of all existing members.
router.get("/members", async (req, res) => {
	try {
		const data = await Member.find(new Query());
		// return a 200 (OK) with a list of members.
		res.status(200).send(data);
	} catch (e) {
		// Return a 400 (Bad Request) for any failure.
		res.status(400).send({ error: e.message });
	}
});

// This endpoint returns a list of all members who are currently clocked in.
router.post("/members", async (req, res) => {
	// Get all members whose next scan will be a "clock out".
	const query = new Query().where("isClockOut", "==", req.body.isClockOut);
	try {
		const data = await Member.find(query);
		// return a 200 (OK) with a list of members.
		res.status(200).send(data);
	} catch (e) {
		// Return a 400 (Bad Request) for any failure.
		res.status(400).send({ error: e.message });
	}
});

// This endpoint will activate the membership of whichever member id is specified
// in the url.
router.patch("/member/activate", async (req, res) => {
	try {
		// Get the member with the correspoding Id.
		const data = await Member.findById(req.query.id);
		console.log(
			`This member has been allotted ${-1}`//28800000 / (1000 * 60)} minutes`
		);

		// Assign the member field monthlyTimeRemaining with 8 hours in miliseconds.
		const data2 = await Member.updateById(req.query.id, {
			isMembershipActive: true,
			monthlyTimeRemaining: -1,
		});

		// return a 200 (OK) with the updated fields.
		res.status(200).send(data2);
	} catch (error) {
		// Return a 400 (Bad Request) for any failure.
		res.status(400).send({ error: error.message });
	}
});

// This endpoint will dactivate the membership of whichever member id is specified
// in the url.
router.patch("/member/:id/deactivate", async (req, res) => {
	try {
		const data = await Member.updateById(req.params.id, {
			isMembershipActive: false,
			monthlyTimeRemaining: 0,
		});
		console.log(`This member has ${0} minutes remaining`);

		// return a 200 (OK) with the updated fields.
		res.status(200).send(data);
	} catch (error) {
		// Return a 400 (Bad Request) for any failure.
		res.status(400).send({ error: error.message });
	}
});

// This endpoint is responsible for clocking members in and out.
router.put("/member/clock-in-out", async (req, res) => {
	try {
		// Find the member with the id inside the query of the request.
		const data = await Member.findById(req.query.id);

		// Will be used to send to the client
		let response;

		// Return a 401 (Unauthorized) status if the swiped user is not an active member.
		if (data.isMembershipActive == false) {
			console.log("Member is not active!");
			res.status(401).send("Unauthorized: Membership is not active.");
			return;
		}

		// Clock out the user if they are presently clocked in.
		if (data.isClockOut == true) {
			console.log("Clocking out");
			data.clockInTimes.push(Date.now());

			// Subtract the time they clocked out from the time they clocked in to subtract
			// from their monthly allotted time.
			// Ensure there are at least two clock-in times
			if (data.clockInTimes.length >= 2) {
				const lastClockIn = data.clockInTimes[data.clockInTimes.length - 1];
				const secondLastClockIn =
					data.clockInTimes[data.clockInTimes.length - 2];

				const timeRemaining =
					data.monthlyTimeRemaining - (lastClockIn - secondLastClockIn);

				console.log(
					`This member has ${timeRemaining / (1000 * 60)} minutes remaining`
				);
				response = await Member.updateById(req.query.id, {
					isClockOut: false,
					monthlyTimeRemaining: data.monthlyTimeRemaining == -1 ? -1 : timeRemaining < 0 ? 0 : timeRemaining,
					clockInTimes: data.clockInTimes,
				});
			} else {
				// Handle the case where there are fewer than two clock-in times
				res.status(500)(
					"Not enough clock-in times to calculate time remaining."
				);
			}
		}

		// Clock in the user if they are presently clocked out.
		else if (data.isClockOut == false) {
			console.log("Clocking in");

			// Return a 401 (Unauthorized) status if the swiped member has no time remaining.
			if (data.monthlyTimeRemaining == 0) {
				res.status(401).send("Unauthorized: Member has no time remaining.");
				return;
			}

			data.clockInTimes.push(Date.now());

			response = await Member.updateById(req.query.id, {
				isClockOut: true,
				clockInTimes: data.clockInTimes,
			});
		}

		// return a 200 (OK) with the updated fields.
		res.status(200).send(response);
	} catch (error) {
		// Return a 400 (Bad Request) for any failure.
		res.status(400).send({ error: error.message });
	}
});

module.exports = router;

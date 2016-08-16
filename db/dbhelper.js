var accountSid = 'AC5e784cc0b718fb1573cdc572e67f4914';
var authToken = 'e222367896ed8b225294cd28b6097fd0';
var twilio = require('twilio');
var Model = require('./db.js');
var jwt  = require('jwt-simple');
var client = new twilio.RestClient(accountSid, authToken);
var ObjectId = require('mongoose').Types.ObjectId;
var http = require('http');
var request = require("request");
var api_key = 'key-417e9083f77969e4e9cf916a2ef8769c';
var domain = 'app25011ddcdf3a4f38b11f9b60d62e1106.mailgun.org';
var mailgun = require('mailgun-js')({apiKey: api_key, domain: domain});




var dbFunc = {

	sendEmail: function(message, res){
		var data = {
		  from: 'Excited User <harish@app25011ddcdf3a4f38b11f9b60d62e1106.mailgun.org>',
		  to: 'hckilaru@gmail.com',
		  subject: 'Whats it say??',
		  text: message
		};

		mailgun.messages().send(data, function (error, body) {
			if(error){
				console.log("email not sent", error);
			}
			console.log('BODY!!', body);
			res.send(body);
		});

	},

	// GET USER ZIP CODE // SEND USERNAME STRING
	getZip: function(username, res) {
		Model.user.findOne({"username": username}, function(err, user) {
			if(err) {
				console.log('username not found');
			}
			res.send(user.zipcode);
		});
	},

	addScript: function(script, res) {
		/*
			Script Format
			{
				"name": 'bactrim',
				"dosage": '1 tablet',
				"refill": '08-17-2016',
				"frequency": '2x per day',
				"reminderTime": '2016-08-10T20:00:00.000Z',
				"username": 'harish'
		}
		*/
		var message = "Time to take your " + script.name + ' (' + script.dosage + ')!';
		var newScript = new Model.script(script);
		newScript.save(function(err){
			if(err) {
				console.log('error', err);
			}

			Model.user.update({"username": script.username}, {$push:{"scripts": newScript}},
			function(err){
				if(err){
					res.send(new Error("script not added to user document"));
				}
				//call set reminder function
				this.setReminder(script.username, newScript._id, message, script.reminderTime, script.refill, script.name); //script.reminderTime is an array of times
			}.bind(this));
		}.bind(this));

	},


	getScripts: function(username, res) {
		Model.user.findOne({'username': username}).populate('scripts').exec(function (err, found) {
			if(err){
				console.log('error in fetching scripts', err);
			}
			res.send(found.scripts);
		});
	},

  addDoc: function(data, res, next) {
  	var newDoc = new Model.doctor(data.doc);
  	newDoc.save(function(err) {
  		if (err) {
  			console.log(err);
  		}
  		Model.user.update({"username": data.username}, {$push:{"doctors": newDoc}}, function(err){
				if(err){
					next(new Error("doctor added to user model"));
				}
				res.send(newDoc);
			});
  	});
  },

  getDocs: function(username, res, next) {
		Model.user.findOne({"username": username}).populate('doctors').exec(function(err, user){
			if(err){
				next(new Error(err));
			}
			res.send(user.doctors);
		});
  },

	deleteDoc: function(id, res, next) {
		Model.doctor.remove({"_id": id}, function(err){
			if(err){
				next("reminder not deleted", err);
			}
			next("doctor deleted");
		});
  },


	/* AUTHENTICATION FUNCTION */


	signup: function(newUser, res, next) {
		Model.user.findOne({"username": newUser.username}, function(err, user){
			if(err) {
				console.log("Error: ", error);
			}
			if(!user) {
				var user = new Model.user(newUser);
				user.save(function(err){
					if(err) {
						console.log("new user not saved", err);
					}
				var token = jwt.encode(user, 'secret'); //create new token
	      res.json({"token": token, "user": {"id": user._id, "username": user.username}}); //send new token and user object
			});

			}
			else {
				next(new Error("user already exists"));
			}
		});
	},

	signin: function(reqUser, res, next){
		var userPassword = reqUser.password;
		Model.user.findOne({"username": reqUser.username}, function(err, user){

			if(err){
				console.log("err was hit"); //if error in query
				next("Error: ", err);
			}
			if(!user){ //if user not found
				next(new Error("username does not exist"));
			}
			else{ //if user found
				user.comparePassword(reqUser.password, function(err, isMatch){
					if(err) {
						console.log("error occurred", err);
						next(new Error("EREROER",  err));
					}
					if(!isMatch){
						next(new Error("Incorrect password")); //will send an error if incorrect password
					}
					else{
						var token = jwt.encode(user, 'secret'); //create new token

						var resultData = {"token": token, "user": {"id": user._id, "username": user.username}}
	          res.status(201).send(resultData); //send new token and user object
					}
				});
			}
		});
	},

	checkAuth: function(req, res, next){
		var token = req.headers['x-access-token'];
	  if (!token) {
	    next(new Error('No token'));
	  }
	  else {
	    var user = jwt.decode(token, 'secret');
	    Model.user.find(user, function(err, user){
	    	if(err){
	    		next("Error: ", error);
	    	}
	    	if(!user.length){ //user not found
	    		res.status(401).send();
	    	}
	    	else{ //token decoded and user found in database
	    		res.status(200).send();
	    	}
	    });
	  }
	},

	getZip: function(username, res) {
		if (!username.username) {
			console.log('no usern@me found');
		}
		else {
			Model.user.findOne({'username': username.username}, function(err, user) {
				if (err) {
					console.error(err);
				}
				else {
					res.status(200).send();
				}
			})
		}
	},

	addSymptom: function(data, res) {
		var newSymptom = new Model.symptom(data);
			newSymptom.save(function(err) {
				if (err) {
					console.log(err);
				}
				res.send(newSymptom);
			});
	},

	setReminder: function(username, scriptID, message, time, refillDate, drugName) { //time is an array
		// look up user object and find their phone number
				Model.user.findOne({"username": username}, function(err, user){
										"use strict";
					if(err){
						next(new Error(err));
					}
					var phoneNum = "+" + user.phone;
					for(let i = 0; i < time.length; i++) {
						if(time[i] !== null){
							var options = {
								method: 'POST',
							  url: 'http://worker-aws-us-east-1.iron.io/2/projects/57a8f721bc022f00078da23f/schedules',
							  qs: { oauth: '0DHLF4oFfGZIbMcdg2W6' },
							  headers:
							   { 'cache-control': 'no-cache',
							     'content-type': 'application/json',
							     oauth: '0DHLF4oFfGZIbMcdg2W6'
								 },
							  body:
							   { schedules:
							      [ { code_name: 'test_worker',
							          payload: JSON.stringify({phone: phoneNum, message: message}),
							          start_at: time[i], //need to change the date to the ISO version new Date('09 August 2016 15:05').toISOString()
							          run_every: 60, //interval in seconds
							          run_times: 10  //how many times until stopped
										} ]
								},
							  json: true
							};
							request(options, function (error, response, body) { //POST to Iron Worker to schedule the recurring texts
							  if (error) throw new Error(error);
								if(body.schedules){
									Model.script.findOneAndUpdate({"_id": scriptID}, { //add ironID to script document
										$push: {
											reminderID: body.schedules[0].id,
										}
									})
									.then(function(res) {
										console.log("reminder has been saved");
									})
									.catch(function(err) {
										console.log(new Error("reminder has not been saved", err));
									});
								}
							});
					}
				}

					//set refill reminder

					if(refillDate){
						var options = {
							method: 'POST',
							url: 'http://worker-aws-us-east-1.iron.io/2/projects/57a8f721bc022f00078da23f/schedules',
							qs: { oauth: '0DHLF4oFfGZIbMcdg2W6' },
							headers:
							 { 'cache-control': 'no-cache',
								 'content-type': 'application/json',
								 oauth: '0DHLF4oFfGZIbMcdg2W6'
							 },
							body:
							 { schedules:
									[ { code_name: 'test_worker',
											payload: JSON.stringify({phone: phoneNum, message: 'Hello from OneCare! Remember to refill your ' + drugName + ' today.' }),
											start_at: refillDate, //need to change the date to the ISO version new Date('09 August 2016 15:05').toISOString()
											run_every: null, //interval in seconds
											run_times: 1  //how many times until stopped
									} ]
							},
							json: true
						};

						request(options, function (error, response, body) { //POST to Iron Worker to schedule the recurring texts
							if (error) throw new Error(error);
							if(body.schedules){
								Model.script.findOneAndUpdate({"_id": scriptID}, { //add ironID to script document
									$push: {
										reminderID: body.schedules[0].id,
									}
								})
								.then(function(){
									console.log("reminderID for DATE added");
								})
								.catch(function(err){
									console.log("reminderID for DATE not added", err);
								})

							}
						});
				}
	});
},

deleteReminder: function(scriptID, res, next) {
	//REMOVES SCRIPT DOCUMENT (reference still persists in user doc but it won't reference anything)
	Model.script.findOne({"_id": scriptID}, function(err, script){
		"use strict";
		if(err){next(new Error(err))}
		console.log("ironID: ", script.reminderID);
		var ironIDs = script.reminderID;
		for(let i = 0; i < ironIDs.length; i++){
			"use strict";
			if(ironIDs[i] !== null){
				var options = {
					method: 'POST',
					url: 'http://worker-aws-us-east-1.iron.io/2/projects/57a8f721bc022f00078da23f/schedules/'+ ironIDs[i] + '/cancel',
					qs: { oauth: '0DHLF4oFfGZIbMcdg2W6' },
					headers:
					 { 'cache-control': 'no-cache',
						 'content-type': 'application/json',
						 oauth: '0DHLF4oFfGZIbMcdg2W6'
					 }
				};
				request(options, function (error, response, body) {
					if (error) throw new Error(error);
				})
			}
		}
		Model.script.remove({"_id": scriptID}, function(err){
			if(err){
				next("reminder not deleted", err);
			}
		});
	})
  res.status(202).send("successfully deleted.")
},

	addNote: function(data, res) {
  	var newNote = new Model.note(data);
  	newNote.save(function(err) {
  		if (err) {
  			console.log(err);
  		}
  		Model.doctor.update({"_id": data.doctor}, {$push:{"notes": newNote}}, function(err){
				if(err){
					next(new Error("note added to doctor model"));
				}
				res.status(201).send(newNote);
			});
  	});
  },

  getNotes: function(doctor, res) {
  	Model.doctor.findOne({"_id": doctor}).populate('notes').exec(function(err, found) {
  		if (err) {
  			res.status(404).send(err);
  		} else {
        res.status(200).send(found.notes);
  		}
  	})
  },

	saveBrain: function(brainState, trainingData, name) {
		var success = Model.brain.findOneAndUpdate({"_id": ObjectId("57a3a316dcba0f71400f021a")}, {
			$set: {
				brainState: brainState,
		  	trainingInputs: trainingData,
			  name: name
			}
		})
		.then(function(res) {
			console.log("Brain ", name, " updated! ");
		})
		.catch(function(err) {
			console.error("dun goofed!  ", err);
		});
	}
};



module.exports = dbFunc;

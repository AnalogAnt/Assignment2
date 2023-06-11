const express = require("express");
const app = express();
app.use(express.json());
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

let db = null;
const dbPath = path.join(__dirname, "twitterClone.db");

const startServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is Running");
    });
  } catch (e) {
    console.log(e.message);
  }
};

startServer();

const authenticateJwt = async (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader != undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken != undefined) {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPass = await bcrypt.hash(password, 10);
  const getUserQuery = `SELECT * FROM user WHERE username ='${username}';`;
  const userDetails = await db.get(getUserQuery);
  if (userDetails === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const postUserQuery = `INSERT INTO user(name,username,password,gender) VALUES ('${name}','${username}','${hashedPass}','${gender}');`;
      await db.run(postUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username ='${username}';`;
  const userDetails = await db.get(getUserQuery);
  if (userDetails === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isValidPass = await bcrypt.compare(password, userDetails.password);
    if (isValidPass === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authenticateJwt, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await db.get(getUserIdQuery);
  const getFollowerId = `SELECT following_user_id FROM follower WHERE follower_user_id = ${userId.user_id};`;
  const followersIdList = await db.all(getFollowerId);
  let responseBody = [];
  for (let index = 0; index < followersIdList.length; index++) {
    const element = followersIdList[index];
    const getTweetsQuery = `SELECT tweet,date_time FROM tweet WHERE user_id = ${element.following_user_id}; ORDER BY date_time DESC,LIMIT 4`;
    const getUsername = `SELECT username FROM user WHERE  user_id = ${element.following_user_id};`;
    const userTweets = await db.all(getTweetsQuery);
    const tweetUsername = await db.get(getUsername);
    for (let j = 0; j < userTweets.length; j++) {
      const element = userTweets[j];
      let responseObject = {
        username: tweetUsername.username,
        tweet: element.tweet,
        dateTime: element.date_time,
      };
      responseBody.push(responseObject);
    }
  }
  response.send(responseBody);
});

module.exports = app;

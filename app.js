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
  const tweetsQuery = `
SELECT
user.username, tweet.tweet, tweet.date_time AS dateTime
FROM
follower
INNER JOIN tweet
ON follower.following_user_id = tweet.user_id
INNER JOIN user
ON tweet.user_id = user.user_id
WHERE
follower.follower_user_id = ${userId.user_id};
ORDER BY
tweet.date_time ASC
LIMIT 4;`;
  const tweetList = await db.all(tweetsQuery);
  response.send(tweetList);
});

app.get("/user/following/", authenticateJwt, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await db.get(getUserIdQuery);
  const getNameQuery = `SELECT user.name FROM follower INNER JOIN user ON follower.following_user_id = user.user_id  WHERE follower.follower_user_id = ${userId.user_id};`;
  const followingNames = await db.all(getNameQuery);
  response.send(followingNames);
});

app.get("/user/followers/", authenticateJwt, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await db.get(getUserIdQuery);
  const getNameQuery = `SELECT user.name FROM follower LEFT JOIN user ON follower.follower_user_id = user.user_id  WHERE follower.following_user_id = ${userId.user_id};`;
  const followerNames = await db.all(getNameQuery);
  response.send(followerNames);
});

app.get("/tweets/:tweetId/", authenticateJwt, async (request, response) => {
  let { username } = request;
  let { tweetId } = request.params;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await db.get(getUserIdQuery);
  const tweetsQuery = `
SELECT
*
FROM tweet
WHERE tweet_id=${tweetId}
`;
  const tweetResult = await db.get(tweetsQuery);
  const userFollowersQuery = `
SELECT
*
FROM follower INNER JOIN user on user.user_id = follower.following_user_id
WHERE follower.follower_user_id = ${userId.user_id};`;
  const userFollowers = await db.all(userFollowersQuery);
  if (
    userFollowers.some((item) => item.following_user_id === tweetResult.user_id)
  ) {
    const getLikesAndReplies = `SELECT tweet.tweet,COUNT(like.tweet_id) as likes,COUNT(reply.tweet_id) as replies,tweet.date_time AS dateTime
      FROM tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply ON tweet.tweet_id = reply.tweet_id WHERE tweet.tweet_id = ${tweetId};`;
    const getResponse = await db.get(getLikesAndReplies);
    response.send(getResponse);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateJwt,
  async (request, response) => {
    let { username } = request;
    let { tweetId } = request.params;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
    const userId = await db.get(getUserIdQuery);
    const checkTheTweetUser = `
  	  select * from tweet inner join follower on tweet.user_id = follower.following_user_id
      where tweet.tweet_id = ${tweetId} and follower.follower_user_id = ${userId.user_id};`;

    const tweet = await database.get(checkTheTweetUser);
    if (tweet === undefined) {
      /*send Invalid Request as response along with the status*/
    } else {
      const getlikesUserQuery = `
          	select user.username
          	from user inner join like on like.user_id = user.user_id
          	where like.tweet_id = ${tweetId};`;
      const likeuserInformation = await database.all(getlikesUserQuery);
      const likes = likeuserInformation.map((user) => {
        return user["username"];
      });
      response.send({ likes }); /*Sending the required response*/
    }
  }
);

app.post("/user/tweets/", authenticateJwt, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await db.get(getUserIdQuery);
  const postTweet = `INSERT INTO tweet(tweet,user_id) VALUES('${tweet}',${userId.user_id}); WHERE tweet.user_id = ${userId.user_id};`;
  await db.run(postTweet);
  response.send("Created a Tweet");
});

app.delete("/tweets/:tweetId/", authenticateJwt, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await db.get(getUserIdQuery);
  const getTweetQUery = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId};`;
  const tweetDetails = await db.get(getTweetQUery);
  if (tweetDetails.user_id === userId.user_id) {
    const deleteQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
    await db.run(deleteQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

app.get("/user/tweets/", authenticateJwt, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await db.get(getUserIdQuery);
  const getTweets = `SELECT tweet ,COUNT(like_id) as likes,COUNT(reply_id)as replies,date_time as dateTime
                       FROM tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
                       WHERE tweet.user_id = ${userId.user_id};`;
  const tweets = await db.all(getTweets);
  console.log(tweets);
});
module.exports = app;

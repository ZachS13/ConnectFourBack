/**
 * BUSINESS LAYER
 * 
 * Logic for making the data coming in and out of the database is
 * secure and in the correct format. This is where we will handle 
 * sanitization, decoding tokens, etc.
 */

const DB = require(`./db.js`),
      bcrypt = require('bcrypt'), 
      crypto = require('crypto');

/**
 * This will be used to make sure that the username and password are valid
 * and safe to be entered into the database.
 * @param {String} username - Username provided.
 * @param {String} password - Password provided.
 * @returns {Object} Object of the user is returned (UserID and SessionID)
 */
async function getUserWithUsernamePassword(username, password) {
    if(!password) {
        return { error: "Please enter a password!" }
    }
    // Validate username
    username = validateSanitizeUsername(username);

    // Send to database and return the result
    let response = await DB.getUserWithUsername(username);
    if(!response) {
        return { error: "Username or password incorrect!" }
    }
    let testPassword = response.password;
    const compare = await comparePasswords(password, testPassword);
    if(compare) {
        return response;
    } else {
        return { error: "Username or password incorrect!" };
    }
}

/**
 * This will be used to create a user and place them into the database. We
 * will validate both the username and password before entering to the database.
 * @param {String} username - Username provided 
 * @param {String} password - Password provided
 * @returns {Object} Object containing the userId.
 */
async function addUser(username, password, confirmPassword) {
    if(!password || !confirmPassword)   {
       let response = { error: "Passwords are blank!" }
       return response;
    }
    let checkMatching = checkMatchingPasswords(password, confirmPassword),
        passHash = await hashString(password);

    if(!checkMatching) {
        let response = {error: "Passwords are not matching!"}
        return response;
    }

    // Validate username
    username = validateSanitizeUsername(username);
    password = passHash;

    // Send to database and return the result
    let response = await DB.addUser(username, password);
    return response;
}

/**
 * This will be used to delete the user. userId, username, and password must be
 * provided so someone who knows the username and password can't delete any user.
 * @param {Integer} userId - User's Id
 * @param {Strign} username - Username (got the username with the user's id)
 * @param {String} password - Provided password (should be hashed already)
 * @returns {Object} Object containing the affected rows, should be >1.
 */
async function deleteUser(userId, username, password) {
    let passHash = await hashString(password);

    // Validate the username
    username = validateSanitizeUsername(username);
    password = passHash;

    if(userId && username && password) {
        // Send to database and return the result
        let response = await DB.deleteUser(userId, username, password);
        return response;
    } else {
        let response = {error: "Was not able to delete account!"}
        return response;
    }
}

/**
 * This will be used to get the username using the userId this will be 
 * @param {Integer} userId User Id which you need the username for
 * @returns {Object} Object containing the username that corresponds to the userId
 */
async function getUsernameById(userId) {
    let response = await DB.getUsernameById(userId);
    return response.username;   
}

/**
 * Will make and store the users session in the database.
 * @param {Integer} ip - IP Address of the user. 
 * @param {Integer} userId - UserId of the user.
 * @param {String} username - User's username
 * @returns {Object} contains the id of the session.
 */
async function setSession(ip, userId, username) {
    username = validateSanitizeUsername(username);
    const exprDate = generateExperationDate(),
          token = createSessionToken(ip, userId, username);
        
    let response = await DB.addSessionToUser(userId, token, exprDate);
    return response;
}

/**
 * Get the stored token in the database that corresponds to
 * the userId and the sessionId.
 * @param {Integer} sessionId - ID of the session.
 * @param {Integer} userId - ID of the user.
 * @returns {String} Token that was stored in the database.
 */
async function getSessionTokenWithIdUserId(sessionId, userId) {
    const response = await DB.getStoredSessionToken(sessionId, userId);
    return response.token;
}

async function getChallengeWithId(challengeId) {
    const response = await DB.getChallengeWithId(challengeId);
    return response;
}

/**
 * Send a game invite to a challenger.
 * @param {Integer} userId - User sending the challenge.
 * @param {Integer} challengerId - User they want to face.
 * @returns {Integer} Challenge_Id of the made record.
 */
async function sendChallenge(userId, challengerId) {
    const response = await DB.sendAChallenge(userId, challengerId);
    return response;
}

/**
 * Respnose to the game challenge, accept or decline it and store in 
 * database.
 * @param {Integer} challengeId - Challenge ID of the game request.
 * @param {Integer} reply - Accept or deny (1 = accept, 0 = deny)
 * @return {Boolean} Was the response sent?
 */
async function sendChallengeResponse(challengeId, reply) {
    if(reply === "accept") {
        reply = true;
    } else if (reply === "decline") {
        reply = false;
    } else {
        return { error: 'There was an error sending the reply!' }
    }
    const response = await DB.sendChallengeResponse(challengeId, reply);
    return response;
}

async function getGameWithId(gameId) {
    const response = await DB.getGameWithId(gameId);
    return response;
}

/**
 * Creates the game with a null gamestate.
 * @param {Integer} userId - User's ID
 * @param {Integer} opponentId - Opponent ID
 * @return {Integer} The gameID
 */
async function createGame(userId, opponentId) {
    const initialBoard = Array(6).fill(null).map(() => Array(7).fill(null));
    const response = await DB.createGame(userId, opponentId, JSON.stringify(initialBoard));
    console.log("In Logic : ", response);
    return response;
}

async function updateGameState(board, nextTurn, gameId) {
    const response = DB.updateGameState(board, nextTurn, gameId);
    return response;
}

/**
 * VALIDATION AND SANITIZATION OF ALL THE PARAMETERS BEING SENT TO THE DATABASE
 * MAKES SURE ALL OF THE VALUES ARE IN THE CORRECT FORM AND CANNOT DAMAGE
 * THE DATABASE.
 */
// Helper function to hash a given string.
async function hashString(value) {
    const hashedString = await bcrypt.hash(value, 10);
    return hashedString;
}

// hashing using crypto for consistency
function hashTokenPart(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * USER HELPER FUNCTIONS
 */
// checks and removes if the username has unallowed characters
function validateSanitizeUsername(username) {
    username = username.replace(/[^a-zA-Z0-9_-]/g, '');

    const usernameRegex = /^[a-zA-Z0-9_-]{3,15}$/;
    let valid = usernameRegex.test(username);
    return valid ? username : null;
}

// Sees if the passHash matches the other password hash.
async function comparePasswords(password, testPassHash) {
    const match = await bcrypt.compare(password, testPassHash);
    return match;
}

// This ensures that the password that is given can be hashed and retrieved.
function checkMatchingPasswords(password, confirmPassword) {
    return password === confirmPassword;
}

/**
 * SESSION HEPLER FUNCTIONS
 */
// function will make the session token (ip, username, userid which are hashed and woven together)
function createSessionToken(ip, userId, username) {
    const ipHash = hashTokenPart(String(ip)),
        userIdHash = hashTokenPart(String(userId)),
        usernameHash = hashTokenPart(username);
    
    const token = createWeave(ipHash, userIdHash, usernameHash);
    return token;
}

// helper function to weave the values together.
function createWeave(hash1, hash2, hash3) {
    const hashLength = Math.max(hash1.length, hash2.length, hash3.length);
    let weavedToken = '';

    // hashes are the same length so there should not be an index out of bounds
    for (let i = 0; i < hashLength; i++) {
        weavedToken += hash1[i];
        weavedToken += hash2[i];
        weavedToken += hash3[i];
    }
    return weavedToken;
}

// generates the expiration date of the token 3 days from now.
function generateExperationDate() {
    const exprDate = new Date();
    exprDate.setDate(exprDate.getDate() + 3); // Modify the date by adding 3 days
    const formatedExprDate = formatDateForSQL(exprDate);
    return formatedExprDate;
}

// helper to format the date for sql.
function formatDateForSQL(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}



/**
 * GAME HELPER FUNCTIONS
 */

module.exports = {
    hashString,
    
    getUserWithUsernamePassword,
    addUser,
    deleteUser,
    getUsernameById,

    setSession,
    createSessionToken,
    getSessionTokenWithIdUserId,

    getChallengeWithId,
    sendChallenge,
    sendChallengeResponse,

    getGameWithId,
    createGame,
    updateGameState,

};

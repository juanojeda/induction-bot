const BotKit        = require('botkit');
const fs            = require('fs');
const readline      = require('readline');
const contentful    = require('contentful-management');

const FILLER_WORDS  = ['for','and','nor','but','or','yet','so','after','although','as','because',
'before','even','if','once','now','that','since','though','unless','until',
'when','where','while','such', 'this', 'is', 'a', 'an', 'some', 'hey', 'hi',
'uh', 'hello', 'um', 'what', 'hiya', 'ok', 'there', ''];

// SLACK CONSTS
const DM                 = 'direct_message';
const AT_MENTION         = 'direct_mention';
const SUB_MENTION        = 'mention';
const AMBIENT            = 'ambient';
const CREATE             = 'create_bot';
const TEST_CHANNEL       = 'G2M18SVDM';
const FALLBACK_CONTACT   = '<@U055VEZUR>';

// CONTENTFUL CONSTS
const SPACE_ID           = 'h2wyvxm6c7w0';
const LANG               = 'en-GB';

/**
 * Gets an array of all the questions from Contentful, in a useful format
 * @param  {object} client the contentful connection class
 * @return {array}         an array of question objects
 */
const fetchQuestions = (client) => {
  let questions = [];
  let isAllEntriesAdded = false;

  client.getSpace(SPACE_ID)
  .then( (space) => {
    space.getEntries()
    .then( (entries) => {
      entries.items.map( (entry) => {
        let question = {};

        question.question = entry.fields.question[LANG];
        question.keywords = entry.fields.keywords[LANG];
        question.response = entry.fields.response[LANG];

        questions.push(question);

      });

    })
  });

  return questions;
}

/**
 * response routine that runs the following algorithm:
 *    - Tries to find a direct match for user's question
 *    - If there's a direct match, returns the corresponding answer, and asks
 *      newbie if this answers their question
 *    - If no direct match, turns question into keywords, and returns all
 *      questions with a matching keyword (sorted by highest no. of matches).
 *    -
 *    - If no matches, logs question as an unanswered question
 * @param  {[type]} bot      [description]
 * @param  {[type]} question [description]
 * @return {[type]}          [description]
 */
function respondToQuestion(bot, question){

}

/**
 * takes the newbie's question and attempts to match directly to a listed
 * question. If a direct match is found, return the corresponding answer.
 * Otherwise, return false.
 * @param  {string} question  The newbie's question
 * @return {object} response  Returns a boolean answerStatus, and an optional
 *                            answer message.
 */
function getDirectMatch(question, questionsStore){
  const response = {
    answerStatus: false,
    answer: ''
  };
  const noobieQn = depunctuate(question.text);

  questionsStore.map((dbQn) => {

    const storeQn = depunctuate(dbQn.question);

    if (storeQn === noobieQn){
      response.answerStatus = true;
      response.answer = dbQn.response;
    }
  });

  return response;
}

/**
 * Utility to remove punctuation from a sentence
 * @param  {string} sentence    a sentence that needs depunctuating
 * @return {[type]}             [description]
 */
function depunctuate(sentence){
  const PUNCTUATION   = /[.,\/#!$%\^&\*;:{}=\-_`~()?]/g;
  const MULTISPACE    = /[\s]{2,}/g;
  const depunctuated  = sentence.replace(PUNCTUATION, " ")
                        .replace(MULTISPACE, " ").trim();

  return depunctuated;
}

/**
 * Takes the newbie's question, strips out useless words (eg. it, and, of, etc),
 * and returns an array of keywords
 * @param  {string} question  The newbie's question
 * @return {array} keywords   The useful keywords
 */
function getKeywords(question){
  let keywords = [];
  let words = depunctuate(question).split(' ');

  words.map((word) => {
    if (FILLER_WORDS.indexOf(word) !== -1){
      return;
    }
    keywords.push(word);
  })

  return keywords;
}

function init(){

  const controller = BotKit.slackbot({
    debug: false,
  });
  const nooBot = controller.spawn({
    token: process.env.SLACKBOT_TOKEN
  }).startRTM();


  const client = contentful.createClient({
    accessToken: process.env.CONTENTFUL_KEY
  });

  const questionsStore = fetchQuestions(client);


  controller.on([AT_MENTION, SUB_MENTION, AMBIENT, DM], (bot, message) => {

    let directMatch = getDirectMatch(message,questionsStore);
    let response;

    if (directMatch.answerStatus){
      response = directMatch.answer;
    } else if (false) {
      // this is where we'd strip out all filler words, and test for keyword matches
    } else {
      // TODO: turn this into a fallback function
      response = `Well this is embarassing, but I don't know the answer to that! Try rephrasing your question, or asking ${FALLBACK_CONTACT}`;
    }

    bot.replyWithTyping(message, response);

  });

}

init();

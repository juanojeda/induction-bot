"use strict";

const BotKit        = require('botkit');
const fs            = require('fs');
const readline      = require('readline');
const contentful    = require('contentful-management');

const FILLER_WORDS  = ['for','and','nor','but','or','yet','so','after','although','as','because',
'before','even','if','once','now','that','since','though','unless','until',
'when','where','while','such', 'this', 'is', 'a', 'an', 'some', 'hey', 'hi',
'uh', 'hello', 'um', 'what', 'hiya', 'ok', 'there', 'noobot'];

// SLACK CONSTS
const DM                 = 'direct_message';
const AT_MENTION         = 'direct_mention';
const SUB_MENTION        = 'mention';
const AMBIENT            = 'ambient';
const CREATE             = 'create_bot';
const TEST_CHANNEL       = 'G2M18SVDM';
const FALLBACK_CONTACT   = '<@U055VEZUR>';
const RESPONSE_METHOD    = {'short': 2000, 'long': 5000}

// CONTENTFUL CONSTS
const SPACE_ID           = 'h2wyvxm6c7w0';
const LANG               = 'en-GB';

// STYLE STUFF
const ANSWER_COLORS      = ['#6abf2d','#bfe560','#e9eeed']

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
 *    - If no matches, logs question as an unanswered question
 * @param  {[type]} bot      [description]
 * @param  {[type]} question [description]
 * @return {[type]}          [description]
 */
function respondToQuestion(bot, question){

}

/**
 * Utility to parse sentence into a usable format
 * @param  {string} sentence    a sentence that needs parsing
 * @return {string} parsed      the parsed sentence
 */
function parseSentence(sentence){
  const PUNCTUATION   = /[.,\/#!$%\^&\*;:{}=\-_`~()?]/g;
  const MULTISPACE    = /[\s]{2,}/g;
  const depunctuated  = sentence.replace(PUNCTUATION, " ")
                        .replace(MULTISPACE, " ").trim();
  const parsed        = depunctuated.toLowerCase();

  return parsed;
}

/**
 * Takes the newbie's question, strips out useless words (eg. it, and, of, etc),
 * and returns an array of keywords
 * @param  {string} question  The newbie's question
 * @return {array} keywords   The useful keywords
 */
function getKeywords(question){
  let keywords = [];
  let words = parseSentence(question).split(' ');

  words.map((word) => {
    if (FILLER_WORDS.indexOf(word) !== -1){
      return;
    }
    keywords.push(word);
  })

  return keywords;
}

/**
 * takes the newbie's question and attempts to match directly to a listed
 * question. If a direct match is found, return the corresponding answer.
 * Otherwise, return false.
 * @param  {string} question        The newbie's question
 * @param  {array} questionsStore   The fetched questions from the CMS
 * @return {object} response        Returns a boolean answerStatus, and an
 *                                  optional answer message.
 */
function getDirectMatch(question, questionsStore){
  const response = {
    answerStatus: false,
    answer: ''
  };
  const noobieQn = parseSentence(question.text);

  questionsStore.map((dbQn) => {

    const storeQn = parseSentence(dbQn.question);

    if (storeQn === noobieQn){
      response.answerStatus = true;
      response.answer = dbQn.response;
    }
  });

  return response;
}

/**
 * Takes an array of keywords, and iterates over the questions store
 * to find a question that has matching keywords
 * @param  {array} keywords         The asked question's keywords
 * @param  {object} questionsStore  The fetched questions from the CMS
 * @return {object} keywordMatches  A response object with a status and an
 *                                  optional array of matching response objects
 */
function getKeywordMatches(keywords, questionsStore){
  const keywordMatches = {
    answerStatus: false,
    answers: []
  };

  const askedSet = new Set(keywords);

  questionsStore.map((dbQn) => {

    const dbKeywords = dbQn.keywords.map((word) => {
      return word.toLowerCase();
    });

    const matches = new Set(dbKeywords.filter(x => askedSet.has(x)));

    if ([...matches].length) {
      dbQn.matches = [...matches];
      keywordMatches.answers.push(dbQn);
    }

  });

  keywordMatches.answerStatus = !!(keywordMatches.answers.length > 0);

  // sort the answers by length of matching keywords
  if (keywordMatches.answerStatus){
    keywordMatches.answers.sort((a,b) => {
      return b.matches.length - a.matches.length;
    });
  }

  return keywordMatches;
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


  controller.on([AT_MENTION, DM], (bot, message) => {

    let directMatch = getDirectMatch(message,questionsStore);
    let response;
    let responseMethod = 'short';

    if (directMatch.answerStatus){
      response = directMatch.answer;
    } else {
      let keywords = getKeywords(message.text);
      let keywordMatches = getKeywordMatches(keywords, questionsStore);

      if (keywordMatches.answerStatus){
        let attachments = [];
        keywordMatches.answers.map((answer, index) => {
          let colorIndex = index > 2 ? 2 : index;
          let answerHash = {
            "title": answer.question,
            "text": answer.response,
            "color": ANSWER_COLORS[colorIndex]
          };
          attachments.push(answerHash);
        });

        if (attachments.length > 1){
          responseMethod = 'long';
        }

        response = {
          "text": `Here's what I found...`,
          "attachments": attachments
        }
      } else {
        // TODO: turn this into a fallback function
        response = `Well this is embarassing, but I don't know the answer to that! Try rephrasing your question, or asking ${FALLBACK_CONTACT}`;
      }

    }

    bot.startTyping(message);
    setTimeout(() => {
      bot.reply(message, response);
    }, RESPONSE_METHOD[responseMethod]);

  });

  controller.on([SUB_MENTION], (bot, message) => {
    // if someone mentions noobot, reply to that person and see
    // if they need help (don't reply public)
  });

}

init();

"use strict";

const BotKit        = require('botkit');
const contentful    = require('contentful-management');
const async          = require('async');

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
const RESPONSE_METHOD    = {'short': 100, 'long': 1000};

// CONTENTFUL CONSTS
const SPACE_ID           = 'h2wyvxm6c7w0';
const LANG               = 'en-GB';

const CMS = contentful;

// STYLE STUFF
const ANSWER_COLORS      = ['#6abf2d','#bfe560','#e9eeed']

/**
* Gets an array of all the questions from Contentful, in a useful format
* @param  {object} CMS the contentful connection class
* @return {promise}         a promise that resolves with the array of entries
*/
function fetchQuestions(CMS){

  let questionsPromise = new Promise((resolve, reject) => {
    let fetch = CMS.getSpace(SPACE_ID)
    .then( (space) => {
      let entriesPromise = space.getEntries().then((entries) => {

        let parseQuestion = (entry, cb) => {

          let question = {};

          if (entry.isPublished()){
            question.question = entry.fields.question[LANG];
            question.keywords = entry.fields.keywords[LANG];
            question.response = entry.fields.response[LANG];

            if (entry.fields.image){
              question.image = entry.fields.image[LANG];
            }

          }

          return cb(null, question);
        };

        async.map(entries.items, parseQuestion, (err, questionsMap) => {

          if (err) throw err;

          let questions = questionsMap.filter((question) => {
            let isQuestionEmpty = Object.keys(question).length === 0;
            return !isQuestionEmpty;
          });

          resolve(questions);
        });

      });
    });
  });

  return questionsPromise;
}

/**
 * Responds to a passive mention with a direct mention conversation to let the
 * noobie know that noobot is there for assistance
 * @param  {object} bot     the bot object
 * @param  {object} message the message object
 * @return n/a
 */
function respondToMention(bot, message){
  bot.startPrivateConversation(
    {
      user: message.user
    }, (err, convo) => {
    if (err){
      // do the error logging
    } else {
      convo.ask(`hey <@${message.user}>, did you have a question I can help you with?`, [
        {
          pattern: bot.utterances.yes,
          callback: (response, convo) => {
            convo.say(`Alright, hit me!`);
            convo.next();
          }
        },
        {
          pattern: bot.utterances.no,
          callback: (response, convo) => {
            convo.say(`No probs!`);
            convo.next();
          }
        },
        {
          default: true,
          callback: (response, convo) => {
            convo.next();
            let newMsg = message;

            bot.api.im.list({}, (error, data) => {
              let userIm = data.ims.map((im) => {
                return im.user === message.user;
              });
              newMsg.channel = userIm.id;
              respondToQuestion(bot, newMsg);
            });

          }
        }
      ]);
    }
  });
}

/**
* response routine that runs the following algorithm:
*    - Fetches latest content from store
*    - Tries to find a direct match for noobie's question
*    - If there's a direct match, returns the corresponding answer, and asks
*      noobie if this answers their question
*    - If no direct match, turns question into keywords, and returns all
*      questions with a matching keyword (sorted by highest no. of matches).
*    - If no matches, logs question as an unanswered question
* @param  {object} bot      the bot object
* @param  {string} question the noobie's question
* @return n/a
*/
function respondToQuestion(bot, message){

  bot.startTyping(message);
  fetchQuestions(CMS)
  .then((questionsStore) => {


    let response;
    let directMatch = getDirectMatch(message,questionsStore);
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
      }
      else {
        response = {
          "text": `I err... what's that again?`
        }
      }
    }

    let makeResponse = (message, response) => {
      return () => {
        bot.reply(message, response);
      }
    };
    setTimeout(makeResponse(message, response), RESPONSE_METHOD[responseMethod]);

  });
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

/**
 * Does all the event binding
 * @return {object} The slackbot controller
 */
function bindEvents(controller){

  controller.on([AT_MENTION, DM], (bot, message) => {
    respondToQuestion(bot, message);
  });

  controller.on([SUB_MENTION], (bot, message) => {
    respondToMention(bot, message);
  });

}

function init(){

  let controller = {};

  if (!process.env.DEV){
    CMS.createClient({
      accessToken: process.env.CONTENTFUL_KEY
    });

    controller = BotKit.slackbot({
      debug: false,
    });

    controller.spawn({
      token: process.env.SLACKBOT_TOKEN
    }).startRTM();
  }



  bindEvents(controller);

}

init();

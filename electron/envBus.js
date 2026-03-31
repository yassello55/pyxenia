// Shared EventEmitter singleton so llm.js and main.js
// can communicate env-ready events without circular requires.
const EventEmitter = require('events');
module.exports = new EventEmitter();

/**
 * ZA Bingo - New Admin Telegram Bot
 * Required Render variables:
 * ADMIN_BOT_TOKEN
 * ADMIN_ID
 */

require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');

const TOKEN = process.env.ADMIN_BOT_TOKEN;
const ADMIN_ID = String(process.env.ADMIN_ID || '').trim();

if (!TOKEN) throw new Error('ADMIN_BOT_TOKEN is missing.');
if (!ADMIN_ID) throw new Error('ADMIN_ID is missing.');

let db;

try {
  db = require('./firebase.js');
} catch (err) {
  db = require('./firebase');
}

const bot = new TelegramBot(TOKEN, {
  polling: {
    autoStart: true,
    interval: 300,
    params: { timeout: 10 }
  }
});

const sessions = new Map();

bot.on('polling_error', (err) => {
  console.error('[AdminBotNew polling error]', err.code || err.message);
});

function isAdmin(msg) {
  return String(msg?.from?.id || '') === ADMIN_ID;
}

function money(value) {
  return `${(Number(value) || 0).toFixed(2)} Br`;
}
function normalizePhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');

  if (digits.startsWith('251')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);

  return digits;
}

function menuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '👥 Players', callback_data: 'players' },
        { text: '🎮 Rooms', callback_data: 'rooms' }
      ],
      [
        { text: '💰 Transactions', callback_data: 'transactions' },
        { text: '📊 Statistics', callback_data: 'stats' }
      ],
      [
        { text: '➕ Add Balance', callback_data: 'add_balance' },
        { text: '➖ Remove Balance', callback_data: 'remove_balance' }
      ],
      [
        { text: '📢 Broadcast', callback_data: 'broadcast' },
        { text: '🔄 Refresh', callback_data: 'home' }
      ]
    ]
  };
}

function backKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '⬅️ Admin Menu', callback_data: 'home' }]
    ]
  };
}

async function showMenu(chatId, messageId = null) {
  const text =
    '👑 *ZA Bingo Admin Panel*\n\n' +
    'Choose an admin action:';

  const options = {
    parse_mode: 'Markdown',
    reply_markup: menuKeyboard()
  };

  if (messageId) {
    try {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        ...options
      });
      return;
    } catch (err) {}
  }

  await bot.sendMessage(chatId, text, options);
}

async function sendOrEdit(chatId, messageId, text, keyboard) {
  const options = {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  };

  if (messageId) {
    try {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        ...options
      });
      return;
    } catch (err) {}
  }

  await bot.sendMessage(chatId, text, options);
}

// ===============================
// PLAYERS
// ===============================

async function showPlayers(chatId, messageId) {
  const snapshot = await db.ref('players')
    .limitToLast(15)
    .once('value');

  const players = snapshot.val() || {};
  const ids = Object.keys(players).reverse();

  let text = `👥 *Recent Players (${ids.length})*\n\n`;

  if (ids.length === 0) {
    text += 'No players found.';
  }

  for (const id of ids) {
    const player = players[id] || {};
    const name = player.firstName || player.username || 'Player';

    text +=
      `• ${name}\n` +
      `ID: \`${id}\`\n` +
      `Balance: ${money(player.balance)}\n\n`;
  }

  await sendOrEdit(chatId, messageId, text, backKeyboard());
}

// ===============================
// GAME ROOMS
// ===============================

async function showRooms(chatId, messageId) {
  let snapshot = await db.ref('rooms').once('value');
  let rooms = snapshot.val();

  if (!rooms) {
    snapshot = await db.ref('game_rooms').once('value');
    rooms = snapshot.val();
  }

  rooms = rooms || {};
  const ids = Object.keys(rooms);

  let text = `🎮 *Game Rooms (${ids.length})*\n\n`;

  if (ids.length === 0) {
    text += 'No room records found.';
  }

  for (const id of ids.slice(0, 20)) {
    const room = rooms[id] || {};
    const playerCount = room.players
      ? Object.keys(room.players).length
      : Number(room.playerCount || 0);

    text +=
      `*Room:* ${id}\n` +
      `Players: ${playerCount}\n` +
      `Status: ${room.status || room.state || 'N/A'}\n\n`;
  }

  await sendOrEdit(chatId, messageId, text, backKeyboard());
}

// ===============================
// TRANSACTIONS
// ===============================

async function showTransactions(chatId, messageId) {
  const snapshot = await db.ref('transactions')
    .limitToLast(15)
    .once('value');

  const transactions = snapshot.val() || {};
  const rows = Object.entries(transactions).reverse();

  let text = `💰 *Recent Transactions (${rows.length})*\n\n`;

  if (rows.length === 0) {
    text += 'No transactions found.';
  }

  for (const [id, tx] of rows) {
    if (!tx) continue;

    text +=
      `ID: \`${id}\`\n` +
      `Type: ${tx.type || 'N/A'}\n` +
      `Amount: ${money(tx.amount)}\n` +
      `Status: ${tx.status || 'N/A'}\n` +
      `Player: \`${tx.telegramId || tx.playerId || 'N/A'}\`\n\n`;
  }

  await sendOrEdit(chatId, messageId, text, backKeyboard());
}

// ===============================
// STATISTICS
// ===============================

async function showStats(chatId, messageId) {
  const [playersSnap, txSnap, roomsSnap] = await Promise.all([
    db.ref('players').once('value'),
    db.ref('transactions').once('value'),
    db.ref('rooms').once('value')
  ]);

  const players = playersSnap.val() || {};
  const transactions = txSnap.val() || {};
  const rooms = roomsSnap.val() || {};

  const totalBalance = Object.values(players).reduce(
    (sum, player) => sum + (Number(player?.balance) || 0),
    0
  );

  const pending = Object.values(transactions).filter(
    tx => tx && String(tx.status).toLowerCase() === 'pending'
  ).length;

  const text =
    `📊 *Platform Statistics*\n\n` +
    `Players: *${Object.keys(players).length}*\n` +
    `Rooms: *${Object.keys(rooms).length}*\n` +
    `Transactions: *${Object.keys(transactions).length}*\n` +
    `Pending transactions: *${pending}*\n` +
    `Total player balances: *${money(totalBalance)}*`;

  await sendOrEdit(chatId, messageId, text, backKeyboard());
}

// ===============================
// BALANCE MANAGEMENT
// ===============================

async function startBalanceAction(chatId, userId, action) {
  sessions.set(String(userId), {
    action,
    step: 'playerId'
  });

  await bot.sendMessage(
    chatId,
    `Send the player's phone number to ${action === 'add' ? 'add' : 'remove'} balance.\n\nSend /cancel to stop.`
  );
}

// ===============================
// BROADCAST
// ===============================

async function startBroadcast(chatId, userId) {
  sessions.set(String(userId), {
    action: 'broadcast',
    step: 'message'
  });

  await bot.sendMessage(
    chatId,
    'Send the announcement text to broadcast to registered players.\n\nSend /cancel to stop.'
  );
}

// ===============================
// START COMMAND
// ===============================

bot.onText(/^\/start$/, async (msg) => {
  if (!isAdmin(msg)) {
    await bot.sendMessage(msg.chat.id, '⛔ Admin access only.');
    return;
  }

  sessions.delete(String(msg.from.id));
  await showMenu(msg.chat.id);
});

bot.onText(/^\/cancel$/, async (msg) => {
  if (!isAdmin(msg)) return;

  sessions.delete(String(msg.from.id));

  await bot.sendMessage(
    msg.chat.id,
    'Cancelled. Use /start to open the admin menu.'
  );
});

// ===============================
// MENU BUTTONS
// ===============================

bot.on('callback_query', async (query) => {
  if (!isAdmin(query)) {
    await bot.answerCallbackQuery(query.id, {
      text: 'Admin access only.',
      show_alert: true
    }).catch(() => {});
    return;
  }

  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const userId = String(query.from.id);

  await bot.answerCallbackQuery(query.id).catch(() => {});

  try {
    switch (query.data) {
      case 'home':
        sessions.delete(userId);
        await showMenu(chatId, messageId);
        break;

      case 'players':
        await showPlayers(chatId, messageId);
        break;

      case 'rooms':
        await showRooms(chatId, messageId);
        break;

      case 'transactions':
        await showTransactions(chatId, messageId);
        break;

      case 'stats':
        await showStats(chatId, messageId);
        break;

      case 'add_balance':
        await startBalanceAction(chatId, userId, 'add');
        break;

      case 'remove_balance':
        await startBalanceAction(chatId, userId, 'remove');
        break;

      case 'broadcast':
        await startBroadcast(chatId, userId);
        break;

      default:
        await bot.sendMessage(chatId, 'Unknown action.');
    }
  } catch (err) {
    console.error('[AdminBotNew callback error]', err);
    await bot.sendMessage(chatId, '⚠️ Action failed. Check Render logs.');
  }
});

// ===============================
// ADMIN TEXT INPUTS
// ===============================

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  if (!isAdmin(msg)) return;

  const userId = String(msg.from.id);
  const session = sessions.get(userId);

  if (!session) return;

  try {
    // BROADCAST MESSAGE
    if (session.action === 'broadcast') {
      const announcement = msg.text.trim();

      if (!announcement) {
        await bot.sendMessage(msg.chat.id, 'Message cannot be empty.');
        return;
      }

      const snapshot = await db.ref('players').once('value');
      const players = snapshot.val() || {};
      const ids = Object.keys(players);

      let sent = 0;
      let failed = 0;

      for (const id of ids) {
        try {
          await bot.sendMessage(
            id,
            `📢 ZA Bingo Announcement\n\n${announcement}`
          );
          sent++;
        } catch (err) {
          failed++;
        }
      }

      sessions.delete(userId);

      await bot.sendMessage(
        msg.chat.id,
        `Broadcast finished.\nSent: ${sent}\nFailed: ${failed}`
      );

      return;
    }

    // ADD / REMOVE BALANCE
    if (session.action === 'add' || session.action === 'remove') {
      if (session.step === 'playerId') {
  const normalizePhone = (phone) => {
    let digits = String(phone || '').replace(/\D/g, '');

    if (digits.startsWith('251')) digits = digits.slice(3);
    if (digits.startsWith('0')) digits = digits.slice(1);

    return digits;
  };

  const phoneInput = normalizePhone(msg.text);

  if (!phoneInput || phoneInput.length < 9) {
    await bot.sendMessage(
      msg.chat.id,
      'Invalid phone number. Send the registered phone number.'
    );
    return;
  }

  const snapshot = await db.ref('players').once('value');
  const players = snapshot.val() || {};

  const matches = Object.entries(players).filter(([id, player]) =>
    normalizePhone(player.phone) === phoneInput
  );

  if (matches.length === 0) {
    await bot.sendMessage(
      msg.chat.id,
      'Player not found. Make sure they registered and shared their phone number.'
    );
    return;
  }

  if (matches.length > 1) {
    await bot.sendMessage(
      msg.chat.id,
      'Multiple players have this phone number. Please use their Telegram ID.'
    );
    return;
  }

  const [playerId, player] = matches[0];

  session.playerId = playerId;
  session.step = 'amount';
  sessions.set(userId, session);

  await bot.sendMessage(
    msg.chat.id,
    `Player found: ${player.first_name || player.firstName || player.username || playerId}\n` +
    `Current balance: ${money(player.balance)}\n\n` +
    'Send the amount in Br (number only).'
  );

  return;
}

if (session.step === 'amount') {
  const amount = Number(msg.text.trim());

  if (!Number.isFinite(amount) || amount <= 0) {
    await bot.sendMessage(
      msg.chat.id,
      'Invalid amount. Send a number greater than 0.'
    );
    return;
  }

  const balanceRef = db.ref(
    `players/${session.playerId}/balance`
  );

  const result = await balanceRef.transaction((current) => {
    const balance = Number(current || 0);

    const newBalance = session.action === 'add'
      ? balance + amount
      : balance - amount;

    if (newBalance < 0) return;

    return Math.round(newBalance * 100) / 100;
  });

  if (!result.committed) {
    sessions.delete(userId);

    await bot.sendMessage(
      msg.chat.id,
      'Balance update failed. Check balance or try again.'
    );

    return;
  }

  const newBalance = Number(result.snapshot.val() || 0);

  const txRef = db.ref('transactions').push();

  await txRef.set({
    type: session.action === 'add'
      ? 'admin_add_balance'
      : 'admin_remove_balance',
    playerId: session.playerId,
    telegramId: session.playerId,
    amount,
    newBalance,
    status: 'completed',
    createdAt: new Date().toISOString(),
    adminId: ADMIN_ID
  });

  sessions.delete(userId);

  await bot.sendMessage(
    msg.chat.id,
    `✅ Balance ${session.action === 'add' ? 'added' : 'removed'}.\n\n` +
    `Player: ${session.playerId}\n` +
    `Amount: ${money(amount)}\n` +
    `New balance: ${money(newBalance)}`
  );
}
    }
  } catch (err) {
    console.error('[AdminBotNew message error]', err);
    sessions.delete(userId);

    await bot.sendMessage(
      msg.chat.id,
      '⚠️ Operation failed. Check Render logs.'
    );
  }
});

console.log('[AdminBotNew] Started polling.');

module.exports = bot;

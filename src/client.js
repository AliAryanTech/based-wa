const {
  DisconnectReason,
  useSingleFileAuthState,
  getContentType,
} = require("@adiwajshing/baileys");
const { Boom } = require("@hapi/boom");
const { checkQR, makeSocket } = require("./models/functions");
const { toLog } = require("@mengkodingan/tolog");

module.exports = class Client {
  constructor({
    name = undefined,
    prefix = undefined,
    autoRead = false,
    authFile = "./state.json",
    printQRInTerminal = true
}) {
    if (!name) throw new Error("[ckptw] name required!");

    if (typeof prefix == "string") {
      prefix = prefix.split();
    }

    if (!prefix) throw new Error("[ckptw] prefix required!");

    this.NAME = name;
    this.PREFIX = prefix;
    this.CMD = new Map();
    this.autoRead = autoRead;
    this.printQRInTerminal = printQRInTerminal;

    this.AUTH_FILE = authFile;
    const { state, loadState, saveState } = useSingleFileAuthState(
      this.AUTH_FILE
    );
    this.state = state;
    this.loadState = loadState;
    this.saveState = saveState;

    this.whats = makeSocket(this);
  }

  onConnectionUpdate(c) {
    this.whats.ev.on("connection.update", async (update) => {
      let qr;
      let self = this;
      checkQR(qr, update, function(con) {
        if(!self.printQRInTerminal) {
          if(c) {
            c(con)
          }
        }
      })

      const { connection, lastDisconnect } = update;
      if (connection === "close") {
        const reason = lastDisconnect.error
          ? new Boom(lastDisconnect)?.output.statusCode
          : 0;

        if (reason === DisconnectReason.loggedOut) {
          console.log(
            "Device Logged Out, Please Delete Session file and Scan Again."
          );
        } else if (reason === DisconnectReason.badSession) {
          toLog(4, 'Bad session file...');
          toLog(1, "Reconnecting...");
          await makeSocket(this);
          toLog(1, 'Should be connected to Whatsapp now. You can exit this process with CTRL+C and rerun if the Whatsapp is not loading anymore.')
        } else if (reason === DisconnectReason.connectionClosed) {
          console.log("Connection closed....");
        } else if (reason === DisconnectReason.connectionLost) {
          console.log("Connection Lost from Server...");
        } else if (reason === DisconnectReason.connectionReplaced) {
          console.log(
            "Connection Replaced, Another New Session Opened, Please Close Current Session First"
          );
          process.exit();
        } else if (reason === DisconnectReason.restartRequired) {
          console.log("Restart Required!");
        } else if (reason === DisconnectReason.timedOut) {
          console.log("Connection TimedOut...");
        } else {
          console.log(`Unknown DisconnectReason: ${reason}|${connection}`);
        }
      }
      if (update.connection == "connecting" || update.receivedPendingNotifications == "false") {
			toLog(1, "waiting for connection")
		}
		if (update.connection == "open" || update.receivedPendingNotifications == "true") {
			this.connect = true;
			toLog(2, `ready on client`, `${this.whats.user.name} || ${this.whats.user.id}`)
		}
    });
  }

  onCredsUpdate() {
    this.whats.ev.on("creds.update", this.saveState);
  }

  onMessage(c) {
    this.whats.ev.on("messages.upsert", async (m) => {
      c? c(m) : '';
      this.m = m;
      let self = { ...this, getContentType };

      if (this.autoRead) {
        this.whats.sendReadReceipt(
          m.messages[0].key.remoteJid,
          m.messages[0].key.participant,
          [m.messages[0].key.id]
        );
      }

      await require("./handler/commands")(self);
    });
  }

  command(...args) {
    for (const w of args) {
      if (!w.name) throw new Error("name required in commands!");
      if (!w.code) throw new Error("code required in commands!");

      this.CMD.set(w.name, w);
    }
  }
};

require("./handler/prototype");

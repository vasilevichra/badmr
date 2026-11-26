import "dotenv/config";
import http from "http";
import app from "../../app.ts";
import TournamentService from "../services/tournament.ts";
import TgBotService from "../services/tg-bot.ts";

const tournamentService = new TournamentService();
// long polling бота Telegram (привязка tg_id) — только при заданном токене
new TgBotService().start();

const host = process.env.HOST || "localhost";
const port = Number(process.env.PORT) || 3000;
http
  .createServer(app)
  .listen(port, host, () => console.log(`Server listens http://${host}:${port}/ in ${process.env.NODE_ENV} mode`));

tournamentService.setLostStatuses();
tournamentService.setDeferredStatusHandlers();

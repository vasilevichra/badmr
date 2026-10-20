import http from "http";
import app from "../../app.ts";
import TournamentService from "../services/tournament.ts";

const tournamentService = new TournamentService();

const host = process.env.HOST || "localhost";
const port = Number(process.env.PORT) || 3000;
http
  .createServer(app)
  .listen(port, host, () => console.log(`Server listens http://${host}:${port}/ in ${process.env.NODE_ENV} mode`));

tournamentService.setLostStatuses();
tournamentService.setDeferredStatusHandlers();

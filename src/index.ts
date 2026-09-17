import express, { Request, Response } from "express";
import net from "net";

const app = express();
app.use(express.json());

// ==========================================
// INTERFACES Y TIPOS
// ==========================================
interface QueryParams {
  orig_state?: string;
  dest_state?: string;
  orig_city?: string;
  eqtype?: string;
  max_results?: number;
}

interface LoadRecord {
  load_id: string;
  origin: string;
  destination: string;
  pickup_date: string;
  equipment_type: string;
  posted_rate: number;
  miles: number;
  status: string;
}

interface NegotiateBody {
  posted_rate: number;
  offered_rate: number;
  load_id?: string;
}

// ==========================================
// CLIENTE SOCKET TCP
// ==========================================
class TcpSocketClient {
  private timeoutMs: number;

  constructor(timeoutMs = 8000) {
    this.timeoutMs = timeoutMs;
  }

  public send(host: string, port: number, payload: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      let responseData = "";
      let isResolved = false;

      client.setTimeout(this.timeoutMs);

      client.connect(port, host, () => {
        client.write(`${payload}\r\n`);
      });

      client.on("data", (chunk: Buffer) => {
        responseData += chunk.toString();
        const trimmed = responseData.trim();
        if (trimmed.endsWith("END") || trimmed.includes("ERR|")) {
          isResolved = true;
          client.destroy();
          resolve(trimmed);
        }
      });

      client.on("end", () => {
        if (!isResolved) {
          isResolved = true;
          resolve(responseData.trim());
        }
      });

      client.on("timeout", () => {
        client.destroy();
        if (!isResolved) {
          isResolved = true;
          reject(new Error(`LTMS Connection Timeout (${this.timeoutMs}ms)`));
        }
      });

      client.on("error", (err: Error) => {
        client.destroy();
        if (!isResolved) {
          isResolved = true;
          reject(err);
        }
      });
    });
  }
}

// ==========================================
// ESTRATEGIA Y COMANDOS
// ==========================================
class CommandFactory {
  public createCommand(
    action: string,
    params: QueryParams,
    authToken: string,
  ): string {
    const act = action ? action.toUpperCase() : "";
    if (act === "QUERY" || act === "LOAD_QUERY") {
      const { orig_state, dest_state, orig_city, eqtype, max_results } = params;
      const parts = ["CMD:LOAD_QUERY", `AUTH:${authToken}`];

      if (orig_city) parts.push(`ORIG_CITY:${orig_city.trim()}`);
      if (orig_state)
        parts.push(`ORIG_STATE:${orig_state.trim().toUpperCase()}`);
      if (dest_state)
        parts.push(`DEST_STATE:${dest_state.trim().toUpperCase()}`);
      if (eqtype) parts.push(`EQTYPE:${eqtype.trim().toUpperCase()}`);
      if (max_results) parts.push(`MAX_RESULTS:${max_results}`);

      return parts.join("|");
    }
    throw new Error(`Unsupported action: ${action}`);
  }
}

// ==========================================
// PARSER DE RESPUESTAS LTMS
// ==========================================
function parseLtmsResponse(rawResponse: string): LoadRecord[] {
  const lines = rawResponse.replace(/\r\n/g, "\n").split("\n");
  const records: LoadRecord[] = [];

  for (const line of lines) {
    const cleanLine = line.trim();
    if (cleanLine.includes("LOAD_ID:")) {
      const fields: Record<string, string> = {};
      const payloadPart = cleanLine.replace(/^<\s*/, "");

      payloadPart.split("|").forEach((part) => {
        const [key, ...val] = part.split(":");
        if (key) {
          fields[key.trim()] = val.join(":").trim();
        }
      });

      records.push({
        load_id: fields.LOAD_ID || "",
        origin:
          `${fields.ORIG_CITY || ""}, ${fields.ORIG_STATE || ""} ${fields.ORIG_ZIP || ""}`.trim(),
        destination:
          `${fields.DEST_CITY || ""}, ${fields.DEST_STATE || ""} ${fields.DEST_ZIP || ""}`.trim(),
        pickup_date: fields.PICKUP_DT || "",
        equipment_type: fields.EQTYPE || "",
        posted_rate: fields.RATE ? parseInt(fields.RATE, 10) / 100 : 0,
        miles: fields.MILES ? parseInt(fields.MILES, 10) : 0,
        status: fields.STATUS || "",
      });
    }
  }

  return records;
}

// ==========================================
// RUTA 1: LTMS QUERY (POST /)
// ==========================================
app.post("/", async (req: Request, res: Response) => {
  try {
    const { action, ...params } = req.body;
    const host = process.env.LTMS_HOST || "";
    const port = parseInt(process.env.LTMS_PORT || "9000", 10);
    const authToken = process.env.LTMS_AUTH_TOKEN || "";

    const commandFactory = new CommandFactory();
    const commandPayload = commandFactory.createCommand(
      action,
      params,
      authToken,
    );

    const tcpClient = new TcpSocketClient(8000);
    const rawResponse = await tcpClient.send(host, port, commandPayload);

    if (rawResponse.startsWith("< ERR") || rawResponse.startsWith("ERR|")) {
      return res.status(400).json({ success: false, error: rawResponse });
    }

    const data = parseLtmsResponse(rawResponse);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// RUTA 2: NEGOTIATION (POST /negotiate)
// ==========================================
app.post("/negotiate", (req: Request<{}, {}, NegotiateBody>, res: Response) => {
  const { posted_rate, offered_rate, load_id } = req.body;
  const MAX_RATE = 2000;
  const offered = Number(offered_rate);
  const posted = Number(posted_rate);

  if (isNaN(offered) || offered <= 0) {
    return res
      .status(400)
      .json({ success: false, error: "Invalid offered rate" });
  }

  const isPossible = offered <= posted || offered <= MAX_RATE;
  const counterOffer = isPossible ? null : MAX_RATE;

  return res.status(200).json({
    success: true,
    load_id: load_id || null,
    negotiation: {
      is_possible: isPossible,
      counter_offer: counterOffer,
      agent_instruction: isPossible
        ? `Accept the offer of $${offered}. Proceed with the confirmation process.`
        : `Indicate the carrier that it is not possible to get: $${offered}. The best you can offer is $${counterOffer}.`,
    },
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Middleware TypeScript listening on port ${PORT}`),
);

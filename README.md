# LTMS Integration Middleware

Node.js & Express service written in TypeScript that acts as a middleware bridge between HTTP client applications and legacy LTMS (Logistics Transportation Management System) TCP Socket servers.

It normalizes JSON HTTP requests into custom pipe-delimited TCP socket commands (`CMD|AUTH|...`), manages socket connections, and parses raw text frame responses back into standard JSON structures.

---

## Architecture Overview

- **Design Patterns:** Uses the **Strategy Pattern** and **Factory Pattern** (`CommandFactory`, `CommandStrategy`) to dynamically register and assemble command payloads.
- **TCP Transport:** Manages raw TCP stream buffers via Node's `net.Socket` with auto-framing and configurable timeouts.
- **Response Parser:** Extracts pipe-delimited key-value strings into structured objects.

---

## Environment Variables

Configure the following variables in your `.env` file or runtime environment:

| Variable          | Description                                     | Default    |
| :---------------- | :---------------------------------------------- | :--------- |
| `PORT`            | HTTP server listening port                      | `3000`     |
| `LTMS_HOST`       | Target LTMS TCP server host/IP                  | _Required_ |
| `LTMS_PORT`       | Target LTMS TCP server port                     | `9000`     |
| `LTMS_AUTH_TOKEN` | Authentication key required by LTMS TCP service | _Required_ |

---

## API Reference

### 1. Execute LTMS Command

Processes commands targeting the LTMS TCP socket backend.

- **URL:** `/`
- **Method:** `POST`
- **Headers:** `Content-Type: application/json`

#### Action: `QUERY` / `LOAD_QUERY`

Searches available load records with optional filter parameters.

- **Payload:**

```json
{
  "action": "QUERY",
  "orig_city": "Dallas",
  "orig_state": "TX",
  "dest_state": "GA",
  "eqtype": "V",
  "max_results": 10
}
```

### Parameters

- **action (string, required)**: "QUERY" or "LOAD_QUERY"
- **orig_city (string, optional)**: Origin city filter
- **orig_state (string, optional)**: 2-letter origin state code
- **dest_state (string, optional)**: 2-letter destination state code
- **eqtype (string, optional)**: Equipment type code (e.g., V, R, F)
- **max_results (number, optional)**: Maximum records limit

#### Action: `GET` / `LOAD_GET` / `GET_LOAD`

Fetches detailed record information for a specific load ID.

- **Payload:**

```json
{
  "action": "GET",
  "load_id": "LD-98231"
}
```

- **Parameters:**
  - `action` (_string, required_): `"GET"`, `"LOAD_GET"`, or `"GET_LOAD"`
  - `load_id` (_string, required_): Unique load identifier

#### Action: `BOOK` / `LOAD_BOOK`

Executes a load booking command against the TCP service.

- **Payload:**

```json
{
  "action": "BOOK",
  "load_id": "LD-98231",
  "mc_number": "1234567",
  "agreed_rate": 1850.5
}
```

- **Parameters:**
  - `action` (_string, required_): `"BOOK"` or `"LOAD_BOOK"`
  - `load_id` (_string, required_): Unique load identifier
  - `mc_number` (_string, required_): Carrier Motor Carrier identifier
  - `agreed_rate` (_number | string, required_): Agreed rate amount (auto-padded and formatted in cents)

#### Success Response (`200 OK`)

```json
{
  "success": true,
  "data": [
    {
      "load_id": "LD-98231",
      "origin": "Dallas, TX 75201",
      "destination": "Atlanta, GA 30301",
      "pickup_date": "2026-10-01",
      "equipment_type": "V",
      "posted_rate": 1850,
      "miles": 780,
      "status": "OPEN"
    }
  ]
}
```

#### Error Responses

- **`400 Bad Request`** (LTMS TCP Protocol Error):

```json
{
  "success": false,
  "error": "ERR|INVALID_LOAD_ID"
}
```

- **`500 Internal Server Error`** (Timeout or Socket Network Failure):

```json
{
  "success": false,
  "error": "LTMS Connection Timeout (8000ms)"
}
```

### 2. Rate Negotiation Assessment

Evaluates carrier rate counter-offers against internal threshold logic.

- **URL:** `/negotiate`
- **Method:** `POST`
- **Headers:** `Content-Type: application/json`

#### Request Payload

```json
{
  "load_id": "LD-98231",
  "posted_rate": 1800,
  "offered_rate": 2100
}
```

#### Response (`200 OK`)

```json
{
  "success": true,
  "load_id": "LD-98231",
  "negotiation": {
    "is_possible": false,
    "counter_offer": 2000,
    "agent_instruction": "Indicate to the carrier that it is not possible to pay $2100. The best you can offer is $2000."
  }
}
```

## Local Development & Setup

1. **Install Dependencies:**

```bash
npm install
```

2. **Environment Configuration:**

Create a `.env` file in the root directory:

```env
PORT=3000
LTMS_HOST=127.0.0.1
LTMS_PORT=9000
LTMS_AUTH_TOKEN=your_auth_token_here
```

3. **Run Service:**

```bash
# Development mode
npm run dev

# Build & Start Production
npm run build
npm start
```

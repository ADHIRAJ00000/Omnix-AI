import request from "supertest";
import { describe, expect, it } from "vitest";
import { useDatabase } from "./helpers/db.js";
import app from "../services/auth/app.js";
import connectDB from "../services/auth/config/db.js";
import User from "../services/auth/models/user.model.js";
import CreditLedger from "../services/auth/models/creditLedger.model.js";

useDatabase(connectDB, User);

const INTERNAL_KEY = "test-internal-key-at-least-16-chars";

// Every request must look like it came from the gateway, which is what the
// services check before trusting anything else about it.
const asGateway = (req) => req.set("x-internal-key", INTERNAL_KEY);

const credentials = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "a-sufficiently-long-password",
};

const register = (overrides = {}) =>
  asGateway(request(app).post("/register")).send({ ...credentials, ...overrides });

/** Pulls the refresh cookie out of a response so it can be replayed. */
const refreshCookieFrom = (response) =>
  response.headers["set-cookie"]?.find((c) => c.startsWith("refreshToken="))?.split(";")[0];

describe("registration", () => {
  it("creates the account and returns an access token", async () => {
    const response = await register().expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.user.email).toBe("ada@example.com");
    expect(response.body.user.credits).toBe(100);
  });

  it("never sends the password hash to the client", async () => {
    const response = await register().expect(201);

    expect(JSON.stringify(response.body)).not.toContain("argon2");
    expect(response.body.user.passwordHash).toBeUndefined();
  });

  it("stores the password hashed, not in plain text", async () => {
    await register().expect(201);

    const user = await User.findOne({ email: "ada@example.com" }).select("+passwordHash");

    expect(user.passwordHash).not.toContain(credentials.password);
    expect(user.passwordHash.startsWith("$argon2id$")).toBe(true);
  });

  it("records the opening balance in the ledger", async () => {
    await register().expect(201);

    const entry = await CreditLedger.findOne({ reason: "signup_grant" });
    expect(entry.delta).toBe(100);
  });

  it("sets an httpOnly refresh cookie", async () => {
    const response = await register().expect(201);
    const raw = response.headers["set-cookie"].find((c) => c.startsWith("refreshToken="));

    expect(raw).toContain("HttpOnly");
  });

  it("rejects a duplicate email", async () => {
    await register().expect(201);
    await register({ name: "Someone Else" }).expect(400);
  });

  it("allows many different accounts", async () => {
    // Guards the bug where a stale non-sparse unique index on firebaseUid meant
    // only one password account could ever exist.
    for (let i = 0; i < 5; i += 1) {
      await register({ email: `user${i}@example.com` }).expect(201);
    }

    expect(await User.countDocuments()).toBe(5);
  });

  it("rejects a short password", async () => {
    const response = await register({ password: "short" }).expect(400);
    expect(response.body.code).toBe("VALIDATION_FAILED");
  });

  it("rejects a malformed email", async () => {
    await register({ email: "not-an-email" }).expect(400);
  });

  it("refuses requests that did not come from the gateway", async () => {
    await request(app).post("/register").send(credentials).expect(403);
  });
});

describe("login", () => {
  it("succeeds with the right password", async () => {
    await register().expect(201);

    const response = await asGateway(request(app).post("/login"))
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);

    expect(response.body.accessToken).toBeTruthy();
  });

  it("is case-insensitive about the email", async () => {
    await register().expect(201);

    await asGateway(request(app).post("/login"))
      .send({ email: "ADA@EXAMPLE.COM", password: credentials.password })
      .expect(200);
  });

  it("rejects the wrong password", async () => {
    await register().expect(201);

    await asGateway(request(app).post("/login"))
      .send({ email: credentials.email, password: "wrong-password-entirely" })
      .expect(401);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    await register().expect(201);

    const wrongPassword = await asGateway(request(app).post("/login"))
      .send({ email: credentials.email, password: "wrong-password-entirely" })
      .expect(401);

    const unknownEmail = await asGateway(request(app).post("/login"))
      .send({ email: "nobody@example.com", password: "wrong-password-entirely" })
      .expect(401);

    // Identical on purpose: differing replies would reveal which addresses have
    // accounts, turning password guessing into a much smaller targeted problem.
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  it("blocks repeated guessing against one account", async () => {
    await register().expect(201);

    for (let i = 0; i < 10; i += 1) {
      await asGateway(request(app).post("/login")).send({
        email: credentials.email,
        password: `guess-number-${i}`,
      });
    }

    const response = await asGateway(request(app).post("/login"))
      .send({ email: credentials.email, password: credentials.password })
      .expect(429);

    expect(response.body.code).toBe("RATE_LIMITED");
  });
});

describe("refresh token rotation", () => {
  it("issues a different refresh token each time", async () => {
    const registered = await register().expect(201);
    const first = refreshCookieFrom(registered);

    const refreshed = await asGateway(request(app).post("/refresh"))
      .set("Cookie", first)
      .expect(200);

    const second = refreshCookieFrom(refreshed);

    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect(refreshed.body.accessToken).toBeTruthy();
  });

  it("revokes the whole family when a retired token is replayed", async () => {
    const registered = await register().expect(201);
    const stolen = refreshCookieFrom(registered);

    // The real user refreshes, which retires the token the attacker holds.
    const refreshed = await asGateway(request(app).post("/refresh"))
      .set("Cookie", stolen)
      .expect(200);
    const current = refreshCookieFrom(refreshed);

    // The attacker replays the retired token. Two copies exist, so one was
    // stolen — but we cannot tell which party is asking.
    await asGateway(request(app).post("/refresh")).set("Cookie", stolen).expect(401);

    // So everything descended from that login dies, including the real user's
    // current token. They sign in again; the attacker gains nothing.
    await asGateway(request(app).post("/refresh")).set("Cookie", current).expect(401);
  });

  it("rejects a made-up refresh token", async () => {
    await asGateway(request(app).post("/refresh"))
      .set("Cookie", "refreshToken=totally.invented")
      .expect(401);
  });

  it("rejects a real token id with the wrong secret", async () => {
    const registered = await register().expect(201);
    const [, value] = refreshCookieFrom(registered).split("=");
    const [tokenId] = value.split(".");

    await asGateway(request(app).post("/refresh"))
      .set("Cookie", `refreshToken=${tokenId}.wrong-secret-half`)
      .expect(401);
  });

  it("rejects a request with no cookie at all", async () => {
    await asGateway(request(app).post("/refresh")).expect(401);
  });
});

describe("logout", () => {
  it("makes the refresh token unusable", async () => {
    const registered = await register().expect(201);
    const cookie = refreshCookieFrom(registered);

    await asGateway(request(app).post("/logout")).set("Cookie", cookie).expect(200);
    await asGateway(request(app).post("/refresh")).set("Cookie", cookie).expect(401);
  });
});

describe("profile", () => {
  it("returns the signed-in user", async () => {
    const registered = await register().expect(201);

    const response = await asGateway(request(app).get("/me"))
      .set("x-user-id", registered.body.user.userId)
      .expect(200);

    expect(response.body.user.email).toBe("ada@example.com");
  });

  it("requires a user", async () => {
    await asGateway(request(app).get("/me")).expect(401);
  });

  it("updates the name but ignores anything else sent with it", async () => {
    const registered = await register().expect(201);
    const userId = registered.body.user.userId;

    await asGateway(request(app).patch("/me"))
      .set("x-user-id", userId)
      .send({ name: "Ada L.", credits: 999999, plan: "pro" })
      .expect(200);

    const user = await User.findById(userId);

    expect(user.name).toBe("Ada L.");
    // The schema strips unknown keys, so a client cannot award itself credits
    // by adding fields to a profile update.
    expect(user.credits).toBe(100);
    expect(user.plan).toBe("free");
  });

  it("lists only the caller's own transactions", async () => {
    const ada = await register().expect(201);
    const bob = await register({ email: "bob@example.com" }).expect(201);

    const response = await asGateway(request(app).get("/me/transactions"))
      .set("x-user-id", ada.body.user.userId)
      .expect(200);

    expect(response.body.transactions).toHaveLength(1);
    expect(response.body.transactions[0].reason).toBe("signup_grant");

    const bobsEntry = await CreditLedger.findOne({ userId: bob.body.user.userId });
    expect(response.body.transactions.map((t) => t.id)).not.toContain(bobsEntry._id.toString());
  });
});

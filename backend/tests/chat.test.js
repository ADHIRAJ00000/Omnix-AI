import request from "supertest";
import { describe, expect, it } from "vitest";
import { useDatabase } from "./helpers/db.js";
import app from "../services/chat/app.js";
import connectDB from "../services/chat/config/db.js";
import Conversation from "../services/chat/models/conversation.model.js";
import Message from "../services/chat/models/message.model.js";

useDatabase(connectDB, Conversation);

const INTERNAL_KEY = "test-internal-key-at-least-16-chars";

const ALICE = "6a5d0000000000000000a11c";
const MALLORY = "6a5d0000000000000000ba4d";

/** A request that looks like it came through the gateway, as a given user. */
const as = (userId, req) => req.set("x-internal-key", INTERNAL_KEY).set("x-user-id", userId);

const createConversation = (userId) =>
  as(userId, request(app).post("/create-conversation")).send({});

describe("access control", () => {
  /**
   * These guard a real vulnerability: message and conversation lookups keyed on
   * the id alone, treating knowledge of an id as proof of ownership. Anyone
   * signed in could read or rename someone else's conversation by changing one
   * value in a URL.
   */

  it("does not let another user read a conversation's messages", async () => {
    const created = await createConversation(ALICE).expect(201);
    const conversationId = created.body._id;

    await as(ALICE, request(app).post("/save-message"))
      .send({ conversationId, role: "user", content: "something private" })
      .expect(201);

    await as(ALICE, request(app).get(`/get-messages/${conversationId}`)).expect(200);

    // 404 rather than 403: replying "it exists but is not yours" would confirm
    // to a stranger that the id is real.
    const response = await as(
      MALLORY,
      request(app).get(`/get-messages/${conversationId}`)
    ).expect(404);

    expect(response.body.message).toBe("Conversation not found");
  });

  it("does not let another user rename a conversation", async () => {
    const created = await createConversation(ALICE).expect(201);

    await as(MALLORY, request(app).post("/update-conversation"))
      .send({ conversationId: created.body._id, title: "hacked" })
      .expect(404);

    const conversation = await Conversation.findById(created.body._id);
    expect(conversation.title).toBe("New Chat");
  });

  it("does not let another user write into a conversation", async () => {
    const created = await createConversation(ALICE).expect(201);

    await as(MALLORY, request(app).post("/save-message"))
      .send({ conversationId: created.body._id, role: "user", content: "injected" })
      .expect(404);

    expect(await Message.countDocuments()).toBe(0);
  });

  it("only lists a user's own conversations", async () => {
    await createConversation(ALICE).expect(201);
    await createConversation(ALICE).expect(201);
    await createConversation(MALLORY).expect(201);

    const response = await as(ALICE, request(app).get("/get-conversations")).expect(200);

    expect(response.body).toHaveLength(2);
    expect(response.body.every((c) => c.userId === ALICE)).toBe(true);
  });

  it("refuses requests that did not come through the gateway", async () => {
    await request(app).get("/get-conversations").set("x-user-id", ALICE).expect(403);
  });

  it("refuses gateway requests carrying no user", async () => {
    await request(app).get("/get-conversations").set("x-internal-key", INTERNAL_KEY).expect(401);
  });
});

describe("validation", () => {
  it("rejects a malformed conversation id instead of crashing", async () => {
    // Previously this reached mongoose and surfaced as a 500 CastError.
    const response = await as(ALICE, request(app).get("/get-messages/not-an-id")).expect(400);

    expect(response.body.code).toBe("VALIDATION_FAILED");
  });

  it("rejects an unknown message role", async () => {
    const created = await createConversation(ALICE).expect(201);

    await as(ALICE, request(app).post("/save-message"))
      .send({ conversationId: created.body._id, role: "system", content: "x" })
      .expect(400);
  });

  it("rejects an empty title", async () => {
    const created = await createConversation(ALICE).expect(201);

    await as(ALICE, request(app).post("/update-conversation"))
      .send({ conversationId: created.body._id, title: "   " })
      .expect(400);
  });

  it("ignores extra fields rather than storing them", async () => {
    const created = await createConversation(ALICE).expect(201);

    await as(ALICE, request(app).post("/save-message"))
      .send({
        conversationId: created.body._id,
        role: "user",
        content: "hello",
        userId: MALLORY, // an attempt to write the message as someone else
      })
      .expect(201);

    const message = await Message.findOne();
    expect(message.userId).toBeUndefined();
  });

  it("returns 404 for an unknown route", async () => {
    await as(ALICE, request(app).get("/nope")).expect(404);
  });
});

describe("messages", () => {
  it("returns messages oldest first", async () => {
    const created = await createConversation(ALICE).expect(201);
    const conversationId = created.body._id;

    for (const content of ["first", "second", "third"]) {
      await as(ALICE, request(app).post("/save-message"))
        .send({ conversationId, role: "user", content })
        .expect(201);
    }

    const response = await as(
      ALICE,
      request(app).get(`/get-messages/${conversationId}`)
    ).expect(200);

    expect(response.body.map((m) => m.content)).toEqual(["first", "second", "third"]);
  });
});

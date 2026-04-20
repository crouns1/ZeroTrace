import assert from "node:assert/strict";
import test from "node:test";
import { isInternalHostname, isPrivateIp } from "./network.js";

test("isPrivateIp blocks local and private ranges", () => {
  assert.equal(isPrivateIp("127.0.0.1"), true);
  assert.equal(isPrivateIp("10.0.5.10"), true);
  assert.equal(isPrivateIp("192.168.1.20"), true);
  assert.equal(isPrivateIp("8.8.8.8"), false);
});

test("isInternalHostname catches local-style names", () => {
  assert.equal(isInternalHostname("localhost"), true);
  assert.equal(isInternalHostname("service.internal"), true);
  assert.equal(isInternalHostname("example.com"), false);
});

import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const {playerNameFormatter} = require("../src/share.cjs");

describe("playerNameFormatter", () => {
  it("без фото и sex=1 ставит заглушку pepe.svg", () => {
    const html = playerNameFormatter(16, "Тувыкина Татьяна", 1, null);
    assert.match(html, /src="\/assets\/images\/pepe\.svg"/);
    assert.doesNotMatch(html, /pepe-girl/);
  });

  it("без фото и sex=0 ставит заглушку pepe-girl.svg", () => {
    const html = playerNameFormatter(2, "Машичева Елена", 0, null);
    assert.match(html, /src="\/assets\/images\/pepe-girl\.svg"/);
    assert.doesNotMatch(html, /pepe\.svg/);
  });

  it("data-URL аватар подставляется как есть", () => {
    const pic = "data:image/webp;base64,UklGRg==";
    const html = playerNameFormatter(1, "Василевич Роман", 1, pic);
    assert.match(html, new RegExp(`src="${pic.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}"`));
    assert.doesNotMatch(html, /pepe/);
  });

  it("сырой base64 оборачивается в data:image/png;base64", () => {
    const html = playerNameFormatter(1, "Василевич Роман", 1, "iVBORw0KGgo=");
    assert.match(html, /src="data:image\/png;base64, iVBORw0KGgo="/);
  });

  it("на мобильном имя сокращается до фамилии и инициала", () => {
    const html = playerNameFormatter(16, "Тувыкина Татьяна", 1, null, true);
    assert.match(html, /Тувыкина Т\./);
    assert.doesNotMatch(html, /secondary-info/);
  });
});

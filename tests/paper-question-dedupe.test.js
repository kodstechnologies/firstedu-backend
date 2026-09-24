import { describe, it, expect } from "@jest/globals";
import {
  dedupePaperQuestionsByStem,
  isNearDuplicateOfAny,
} from "../src/utils/paperQuestionDedupe.js";

describe("paperQuestionDedupe", () => {
  it("keeps distinct stems", () => {
    const input = [
      { questionText: "Find the derivative of x^2 at x=1." },
      { questionText: "A particle starts from rest with acceleration 2 m/s^2." },
    ];
    expect(dedupePaperQuestionsByStem(input)).toHaveLength(2);
  });

  it("drops exact duplicate stems", () => {
    const input = [
      { questionText: "What is the SI unit of force?" },
      { questionText: "What is the SI unit of force?" },
      { questionText: "What is the SI unit of force?" },
    ];
    expect(dedupePaperQuestionsByStem(input)).toHaveLength(1);
  });

  it("drops near-duplicate template clones across topics", () => {
    const a = {
      questionText:
        "A uniform thin circular disc of mass M and radius R is projected horizontally on a rough floor with velocity v0.",
      _topicId: "M05",
      options: ["A", "B", "C", "D"],
    };
    const b = {
      questionText:
        "A uniform thin circular disc of mass m and radius r is projected horizontally on a rough floor with velocity u0.",
      _topicId: "M09",
      options: ["A", "B", "C", "D"],
    };
    expect(isNearDuplicateOfAny(b, [a])).toBe(true);
    expect(dedupePaperQuestionsByStem([a, b])).toHaveLength(1);
  });
});

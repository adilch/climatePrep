import { describe, expect, it } from "vitest";
import {
  CreateProjectInput,
  ProvenanceChain,
  ProjectStatus,
  CdaConsequenceCategory,
  OGL_CANADA_ATTRIBUTION,
} from "@climateprep/core-ts";

describe("CreateProjectInput", () => {
  it("accepts a valid project and defaults description", () => {
    const parsed = CreateProjectInput.parse({ name: "Ghost Reservoir DSR" });
    expect(parsed.name).toBe("Ghost Reservoir DSR");
    expect(parsed.description).toBe("");
  });

  it("rejects an empty name", () => {
    const res = CreateProjectInput.safeParse({ name: "" });
    expect(res.success).toBe(false);
  });
});

describe("domain enums", () => {
  it("enumerates the CDA consequence categories", () => {
    expect(CdaConsequenceCategory.options).toEqual([
      "low",
      "significant",
      "high",
      "very_high",
      "extreme",
    ]);
  });

  it("enumerates the project state machine", () => {
    expect(ProjectStatus.options).toContain("report_ready");
  });
});

describe("provenance", () => {
  it("requires engine + app versions on the chain", () => {
    const res = ProvenanceChain.safeParse({ pulls: [], method: "lmoments" });
    expect(res.success).toBe(false); // missing engineVersion/appVersion
  });

  it("carries OGL attribution text", () => {
    expect(OGL_CANADA_ATTRIBUTION).toContain("Open Government Licence");
  });
});

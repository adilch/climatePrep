import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProvenanceFooter } from "@climateprep/ui";

describe("ProvenanceFooter", () => {
  it("renders engine, app version, and seed", () => {
    render(
      <ProvenanceFooter engineVersion="0.0.0" appVersion="1.2.3" seed={42} />,
    );
    const footer = screen.getByTestId("provenance-footer");
    expect(footer.textContent).toContain("engine 0.0.0");
    expect(footer.textContent).toContain("app 1.2.3");
    expect(footer.textContent).toContain("seed 42");
  });
});

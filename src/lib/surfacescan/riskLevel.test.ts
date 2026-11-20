import { describe, expect, it } from "vitest";
import { jobPostureScore, jobRiskLevel, surfaceRiskLevelFromPoints } from "./riskLevel";

describe("surfaceRiskLevelFromPoints", () => {
  it("usa le soglie del server sui punti di rischio", () => {
    expect(surfaceRiskLevelFromPoints(0)).toBe("Basso");
    expect(surfaceRiskLevelFromPoints(10.9)).toBe("Basso");
    expect(surfaceRiskLevelFromPoints(11)).toBe("Medio");
    expect(surfaceRiskLevelFromPoints(25)).toBe("Alto");
    expect(surfaceRiskLevelFromPoints(60)).toBe("Critico");
  });

  it("senza punti non c'è fascia", () => {
    expect(surfaceRiskLevelFromPoints(null)).toBeNull();
    expect(surfaceRiskLevelFromPoints(undefined)).toBeNull();
    expect(surfaceRiskLevelFromPoints("x")).toBeNull();
  });

  // Il caso di Luca: 74/100 compariva «Basso» nei KPI e «Medio» altrove.
  it("74/100 di postura (26 punti) è una sola fascia", () => {
    expect(jobRiskLevel({ posture_score: 74, risk_points: 26 })).toBe("Alto");
  });
});

describe("jobRiskLevel", () => {
  it("preferisce la fascia del server", () => {
    expect(jobRiskLevel({ risk_level: "Medio", risk_points: 80 })).toBe("Medio");
    expect(jobRiskLevel({ risk_level: "boh", risk_points: 80 })).toBe("Critico");
  });
});

describe("jobPostureScore", () => {
  it("legge posture_score e, per i job vecchi, overall_score", () => {
    expect(jobPostureScore({ posture_score: 84 })).toBe(84);
    expect(jobPostureScore({ overall_score: "70" })).toBe(70);
    expect(jobPostureScore({})).toBeNull();
    expect(jobPostureScore(null)).toBeNull();
  });
});

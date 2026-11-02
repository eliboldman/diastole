"use client";

import { useState } from "react";

import InterventionPanel from "@/components/InterventionPanel";
import PhysiologyBackground from "@/components/PhysiologyBackground";
import SystemHero from "@/components/SystemHero";
import AthleteGrid from "@/components/AthleteGrid";
import SystemMetrics from "@/components/SystemMetrics";
import DashboardHeader from "@/components/layout/DashboardHeader";
import DashboardShell from "@/components/layout/DashboardShell";

import { athletes } from "@/data/athletes";

import {
  calculateReadiness,
  calculateTeamReadiness,
  getSystemStatus,
} from "@/lib/readiness";

export default function Home() {
  const [hoveredAthlete, setHoveredAthlete] =
    useState<string | null>(null);

  const [acceptedAdjustments, setAcceptedAdjustments] =
    useState<string[]>([]);

  function acceptAdjustment(name: string) {
    if (acceptedAdjustments.includes(name)) {
      return;
    }

    setAcceptedAdjustments((current) => [...current, name]);
  }

  const teamScore = calculateTeamReadiness(athletes);
  const system = getSystemStatus(teamScore, false);

  const stabilizationProgress = acceptedAdjustments.length / 2;
  const environmentOpacity = 0.18 - stabilizationProgress * 0.12;

  const hoveredAthleteData = athletes.find(
    (athlete) => athlete.name === hoveredAthlete
  );

  const hoveredReadiness = hoveredAthleteData
    ? calculateReadiness(hoveredAthleteData)
    : null;

  const focusTone =
    hoveredReadiness?.status === "Green"
      ? "green"
      : hoveredReadiness?.status === "Yellow"
        ? "yellow"
        : hoveredReadiness?.status === "Red"
          ? "red"
          : null;

  return (
    <DashboardShell>
      <PhysiologyBackground
  variant="atmosphere"
  stressOpacity={environmentOpacity}
  focusTone={focusTone}
  systemTone={
    acceptedAdjustments.length >= 2
      ? "blue"
      : teamScore >= 80
        ? "green"
        : teamScore >= 60
          ? "yellow"
          : "red"
  }
/>

      <div className="relative z-10">
        <DashboardHeader />

        <SystemHero
          teamScore={teamScore}
          system={system}
          acceptedCount={acceptedAdjustments.length}
          totalInterventions={2}
        >
          <InterventionPanel
            acceptedAdjustments={acceptedAdjustments}
            acceptAdjustment={acceptAdjustment}
          />
        </SystemHero>
<SystemMetrics athletes={athletes} />
        <AthleteGrid
          athletes={athletes}
          hoveredAthlete={hoveredAthlete}
          setHoveredAthlete={setHoveredAthlete}
        />
      </div>
    </DashboardShell>
  );
}
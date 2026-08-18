import { SimulateButton } from "./simulate-button";

export const dynamic = "force-dynamic";

export default function AdminSimulationPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Simulation (dry run)</h2>
      <SimulateButton />
    </div>
  );
}

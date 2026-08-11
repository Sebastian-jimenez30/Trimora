export type AppointmentInterval = {
  id: string;
  startTime: string;
  endTime: string;
};

export type AppointmentLayout = { lane: number; lanes: number };

export function getAppointmentLayouts(appointments: AppointmentInterval[]) {
  const layouts = new Map<string, AppointmentLayout>();
  const sorted = [...appointments].sort(
    (first, second) => Date.parse(first.startTime) - Date.parse(second.startTime),
  );
  let cluster: AppointmentInterval[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  const saveCluster = () => {
    const laneEnds: number[] = [];
    const lanes = new Map<string, number>();
    for (const appointment of cluster) {
      const start = Date.parse(appointment.startTime);
      const end = Date.parse(appointment.endTime);
      const availableLane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
      const lane = availableLane === -1 ? laneEnds.length : availableLane;
      if (availableLane === -1) laneEnds.push(end);
      else laneEnds[lane] = end;
      lanes.set(appointment.id, lane);
    }
    for (const appointment of cluster) {
      layouts.set(appointment.id, {
        lane: lanes.get(appointment.id) ?? 0,
        lanes: laneEnds.length,
      });
    }
  };

  for (const appointment of sorted) {
    const start = Date.parse(appointment.startTime);
    const end = Date.parse(appointment.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new Error("La cita contiene un intervalo invalido");
    }
    if (cluster.length > 0 && start >= clusterEnd) {
      saveCluster();
      cluster = [];
      clusterEnd = Number.NEGATIVE_INFINITY;
    }
    cluster.push(appointment);
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length > 0) saveCluster();
  return layouts;
}

export function getSelfMetricVariant(metric) {
  if (metric.id === 'calories') return 'calories';
  if (metric.id === 'weight') return 'weight';
  if (metric.id === 'heartRate') return 'pulse';
  if (metric.id === 'nextMove') return 'nextMove';
  if (metric.id === 'emotionalState') return 'emotional';
  return 'score';
}

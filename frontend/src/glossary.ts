export const TOTAL_TIP = 'The overall risk score supplied with the data (0 = no risk, 100 = maximum risk). It is described as a weighted average of the sub-scores, but the weights are not provided, so it is shown exactly as supplied and never recalculated.';

export const GLOSSARY: { term: string; definition: string }[] = [
  { term: 'Risk level', definition: 'The label supplied with the data (Low, Medium, High, Critical). It is shown as given; it is never derived from a score here.' },
  { term: 'Sub-score', definition: 'One risk category, e.g. financial health or compliance, scored 0–100 where 0 = no risk and 100 = maximum risk.' },
  { term: 'Total Risk Index', definition: TOTAL_TIP },
  { term: 'Median', definition: 'The middle value across all suppliers in the loaded dataset: half score lower, half higher. A descriptive reference, not a target.' },
];

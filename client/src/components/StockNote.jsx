const LABELS = {
  low_stock: 'Few copies left',
  out_of_stock: 'Out of stock',
};

/** Availability remark; shown only when there is something to say. */
export default function StockNote({ status }) {
  const label = LABELS[status];
  if (!label) return null;
  return <span className={`stock stock--${status}`}>{label}</span>;
}

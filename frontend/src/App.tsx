import { useEffect, useState } from 'react';
import { api, type Metadata, type SupplierPage } from './api';

export default function App() {
  const [meta, setMeta] = useState<Metadata>();
  const [page, setPage] = useState<SupplierPage>();
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.meta(), api.suppliers(new URLSearchParams({ limit: '10' }))])
      .then(([metadata, suppliers]) => { setMeta(metadata); setPage(suppliers); })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  return (
    <main className="mx-auto max-w-6xl p-8">
      <p className="text-sm font-semibold uppercase tracking-widest text-teal-700">Siemens hackathon · Starter</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Supplier Risk Intelligence</h1>
      <p className="mt-3 text-slate-600">Explore suppliers, compare risk and support procurement decisions with evidence.</p>
      {error && <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold">Data connection</h2>
        <p className="mt-2 text-slate-600">{meta ? `${meta.row_count.toLocaleString()} suppliers · ${meta.risk_fields.length} risk metrics` : 'Connecting to Python API…'}</p>
        <p className="mt-2 text-sm text-slate-500">All risk scores: 0 = no risk, 100 = maximum risk. Operational percentages have their own meanings.</p>
        <div className="mt-5 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-slate-200"><th className="py-3">Supplier ID</th><th>Name</th><th>Total risk</th><th>Level</th></tr></thead>
            <tbody>{page?.items.map(supplier => <tr className="border-b border-slate-100" key={supplier.supplierID}>
              <td className="py-3 font-mono">{supplier.supplierID}</td><td>{supplier['Supplier Name']}</td><td>{supplier.Total_Risk_Index ?? 'Unknown'}</td><td>{supplier.Total_Risk_Index_Level}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
      <p className="mt-6 text-sm text-slate-600">Starter scope: working supplier APIs and data connection. Filters, comparison UI, chatbot, research and jury access remain on the build plan.</p>
      <a className="mt-4 inline-block font-medium text-teal-700 underline" href="/api/docs" target="_blank" rel="noreferrer">Open API documentation</a>
    </main>
  );
}


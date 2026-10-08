import BookFlow from "../../components/book-flow";
import SiteHeader from "../../components/site-header";
import { loadCatalog } from "../../lib/catalog";

export default async function BookPage() {
  const catalog = await loadCatalog();
  if (catalog.error) {
    return (
      <>
        <SiteHeader />
        <main className="book-page">
          <p className="eyebrow">Запись · BRUT</p>
          <h1>Ваше кресло.</h1>
          <p>{catalog.error}</p>
        </main>
      </>
    );
  }
  return <BookFlow services={catalog.services} barbers={catalog.barbers} />;
}

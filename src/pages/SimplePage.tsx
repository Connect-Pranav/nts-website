import { GlassButton } from '../components/GlassButton';

export function NotFound() {
  return (
    <section className="page container" aria-labelledby="page-title">
      <h1 id="page-title">Page not found</h1>
      <p className="lead">That link does not exist. Head back to the homepage or use search.</p>
      <div style={{ marginTop: 28 }}>
        <GlassButton href="/" arrow>
          Back to home
        </GlassButton>
      </div>
    </section>
  );
}

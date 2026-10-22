import Container from '../Container/Container.jsx';

export default function Section({ eyebrow, title, description, children, tone = '', id }) {
  return <section id={id} className={`section ${tone}`}><Container>
    {(eyebrow || title || description) && <header className="section-heading">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}{title && <h2>{title}</h2>}{description && <p className="section-description">{description}</p>}
    </header>}
    {children}
  </Container></section>;
}

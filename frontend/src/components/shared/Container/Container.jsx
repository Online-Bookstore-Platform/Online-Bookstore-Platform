export default function Container({ as: Element = 'div', className = '', children, ...props }) {
  return <Element className={`container ${className}`.trim()} {...props}>{children}</Element>;
}

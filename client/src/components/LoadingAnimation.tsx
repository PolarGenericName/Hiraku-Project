export default function LoadingAnimation({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'scale-75',
    md: 'scale-100',
    lg: 'scale-125',
  };

  return (
    <div className={`flex items-center justify-center ${sizeClasses[size]}`}>
      <div className="loader">
        <div></div>
        <div></div>
        <div></div>
        <div></div>
        <div></div>
      </div>
    </div>
  );
}

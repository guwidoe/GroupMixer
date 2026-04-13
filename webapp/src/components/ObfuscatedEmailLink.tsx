import { useEffect, useState } from 'react';

interface ObfuscatedEmailLinkProps {
  localPart: string;
  domain: string;
  className?: string;
}

export function ObfuscatedEmailLink({
  localPart,
  domain,
  className = 'underline underline-offset-4',
}: ObfuscatedEmailLinkProps) {
  const [email, setEmail] = useState('');

  useEffect(() => {
    setEmail(`${localPart}@${domain}`);
  }, [domain, localPart]);

  if (!email) {
    return <span>{localPart} [at] {domain}</span>;
  }

  return (
    <a href={`mailto:${email}`} className={className}>
      {email}
    </a>
  );
}

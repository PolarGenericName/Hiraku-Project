import { useState, useRef } from 'react';
import { useAccount } from '@/contexts/AccountContext';
import { Upload, User, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export default function AccountSetup() {
  const { createAccount } = useAccount();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string>('');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo: 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAvatar(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('Digite seu nome');
      return;
    }
    createAccount(name.trim(), avatar || '');
    toast.success('Conta criada!');
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="text-center space-y-3">
          <img src="/logo.png" alt="Hiraku" className="w-16 h-16 mx-auto object-contain" />
          <h1 className="text-3xl font-bold text-white">Bem-vindo ao Hiraku</h1>
          <p className="text-gray-400">Crie seu perfil para começar</p>
        </div>

        {/* Avatar Upload */}
        <div className="flex justify-center">
          <button
            onClick={() => fileRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`relative w-28 h-28 rounded-full border-2 border-dashed transition-all duration-200 overflow-hidden group ${
              dragging
                ? 'border-purple-500 bg-purple-500/10'
                : avatar
                ? 'border-purple-500/50'
                : 'border-gray-600 hover:border-purple-500/50 bg-white/5'
            }`}
          >
            {avatar ? (
              <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 group-hover:text-purple-400 transition-colors">
                <Upload size={24} />
                <span className="text-xs mt-1">Foto</span>
              </div>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>

        {/* Name Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Seu nome</label>
          <div className="relative">
            <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Como quer ser chamado?"
              maxLength={30}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-10 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50 transition-colors"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          Começar
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}

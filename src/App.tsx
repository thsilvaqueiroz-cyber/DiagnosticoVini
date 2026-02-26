import { useState, useEffect, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Check, ArrowRight } from 'lucide-react';
import { supabase } from './lib/supabase';

// Polyfill básico para scrollIntoView em navegadores muito antigos
if (typeof window !== 'undefined' && !window.Element.prototype.scrollIntoView) {
  // @ts-ignore
  window.Element.prototype.scrollIntoView = function() {};
}

export default function App() {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  const totalQuestions = 17;

  const validatePhone = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 11) return false;
    // Basic Brazilian phone validation: DD + 8 or 9 digits
    const regex = /^[1-9]{2}9?[0-9]{8}$/;
    return regex.test(digits);
  };

  const maskPhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  useEffect(() => {
    const answered = new Set<string>();
    
    // Check textareas and inputs
    Object.entries(formData).forEach(([key, value]) => {
      if (typeof value === 'string' && value.trim().length > 2) {
        answered.add(key.substring(0, 3) === 'lea' ? key : key.substring(0, 3));
      } else if (typeof value === 'boolean' && value === true) {
        answered.add(key.substring(0, 3));
      } else if (value !== undefined && value !== null && value !== '') {
        answered.add(key.substring(0, 3) === 'lea' ? key : key.substring(0, 3));
      }
    });

    setProgress(answered.size);
  }, [formData]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    if (name === 'lead_phone') {
      const masked = maskPhone(value);
      setFormData(prev => ({ ...prev, [name]: masked }));
      if (masked.length > 0 && !validatePhone(masked)) {
        setPhoneError('Por favor, insira um WhatsApp válido com DDD');
      } else {
        setPhoneError(null);
      }
      return;
    }

    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validatePhone(formData.lead_phone || '')) {
      setPhoneError('Por favor, insira um WhatsApp válido com DDD');
      const phoneInput = document.getElementsByName('lead_phone')[0];
      phoneInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setIsSubmitting(true);

    const questionMap: Record<string, string> = {
      lead_name: "Nome completo",
      lead_phone: "WhatsApp (com DDD)",
      q01: "Qual é o nome da sua empresa e o seu setor de atuação?",
      q02: "Há quanto tempo a empresa está no mercado?",
      q03: "Qual é o faturamento médio mensal da empresa hoje?",
      q04: "Qual é o principal produto ou serviço que a empresa vende?",
      q05: "Qual é o ticket médio da sua venda?",
      q06: "A empresa já investe ou investiu em tráfego pago (Google Ads, Meta Ads)?",
      q07: "Se já investiu em tráfego pago, qual foi seu maior desafio ou frustração?",
      q08: "Hoje, de onde vêm a maioria dos seus clientes?",
      q09: "A empresa possui um processo de vendas estruturado (CRM, funil, follow-up)?",
      q10: "A empresa produz conteúdo em vídeo para redes sociais atualmente?",
      q11: "Qual é o principal objetivo que você quer alcançar com a nossa parceria?",
      q12: "Em 6 meses, qual resultado concreto você esperaria ver para considerar essa parceria um sucesso?",
      q13: "Qual é o orçamento mensal disponível para investir em marketing digital?",
      q14: "Quem será o responsável por aprovar e acompanhar esse projeto dentro da empresa?",
      q15: "Tem alguma informação importante sobre o seu negócio ou desafio específico que devemos saber antes da reunião?"
    };

    // Construct detailed payload for n8n
    const detailedResponses = Object.keys(questionMap).map(key => {
      let answer = "";
      if (key === 'q08') {
        const options = [
          { id: 'a', label: 'Indicação / boca a boca' },
          { id: 'b', label: 'Redes sociais (orgânico)' },
          { id: 'c', label: 'Tráfego pago' },
          { id: 'd', label: 'Prospecção ativa' },
          { id: 'e', label: 'Outros' }
        ];
        const selected = options
          .filter(opt => formData[`q08${opt.id}`])
          .map(opt => opt.label);
        
        answer = selected.length > 0 ? selected.join(', ') : "Nenhuma opção selecionada";
      } else {
        answer = formData[key] || "Não respondido";
      }

      return {
        id: key,
        question: questionMap[key],
        answer: answer
      };
    });

    try {
      // 1. Save to Supabase
      const { error } = await supabase
        .from('form_responses')
        .insert([formData]);

      if (error) throw error;

      // 2. Trigger n8n Webhook
      try {
        await fetch('https://n8n-n8n.gjvjfn.easypanel.host/webhook/formulariovini', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            lead_info: {
              name: formData.lead_name || "",
              phone: formData.lead_phone || ""
            },
            responses: detailedResponses,
            raw_data: formData,
            submitted_at: new Date().toISOString(),
            source: 'Diagnóstico Estratégico App'
          }),
        });
      } catch (webhookError) {
        console.error('Error triggering webhook:', webhookError);
      }
      
      setIsSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('Ocorreu um erro ao enviar o formulário. Por favor, verifique se as credenciais do Supabase estão configuradas corretamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-6"
        >
          <div className="w-20 h-20 bg-gradient-to-br from-accent2 to-accent rounded-3xl flex items-center justify-center text-4xl mx-auto shadow-2xl shadow-accent2/30">
            🎯
          </div>
          <h1 className="font-syne text-3xl font-extrabold text-white">Tudo certo!</h1>
          <p className="text-muted text-lg leading-relaxed">
            Seu formulário foi enviado com sucesso. Nossa equipe vai analisar suas respostas antes da reunião e chegar preparada para aproveitar ao máximo o nosso tempo juntos.
          </p>
          <button 
            onClick={() => setIsSubmitted(false)}
            className="text-accent2 hover:text-white transition-colors font-medium"
          >
            Enviar outra resposta
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg relative overflow-x-hidden selection:bg-accent2/30">
      {/* Background Gradients */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_80%_60%_at_20%_10%,rgba(108,99,255,0.08)_0%,transparent_60%)]" />
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_60%_50%_at_80%_90%,rgba(255,63,91,0.06)_0%,transparent_60%)]" />
      </div>

      <main className="relative z-10 max-w-3xl mx-auto px-6 py-16 md:py-24">
        {/* Hero */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 bg-accent2/10 border border-accent2/30 text-[#A89FFF] text-xs font-bold tracking-widest uppercase px-4 py-2 rounded-full mb-8">
            <span className="w-1.5 h-1.5 bg-accent2 rounded-full animate-pulse-custom" />
            Pré-Diagnóstico Estratégico
          </div>
          <h1 className="font-syne text-4xl md:text-6xl font-extrabold leading-tight mb-6 tracking-tight">
            Antes de nos <span className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-transparent">reunirmos</span>,<br />
            nos conte sobre você
          </h1>
          <p className="text-muted text-lg md:text-xl font-light max-w-lg mx-auto leading-relaxed">
            Este formulário nos ajuda a preparar uma proposta 100% personalizada para o seu negócio — sem perder tempo com o básico na reunião.
          </p>
        </motion.div>

        {/* Progress */}
        <div className="mb-12">
          <div className="flex justify-between items-end mb-2">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">Progresso</span>
            <span className="text-xs font-bold text-muted uppercase tracking-wider">
              {progress} de {totalQuestions} perguntas respondidas
            </span>
          </div>
          <div className="h-1.5 bg-surface border border-border rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-gradient-to-r from-accent2 to-accent"
              initial={{ width: 0 }}
              animate={{ width: `${(progress / totalQuestions) * 100}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-16">
          {/* Lead Info */}
          <section className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent2 to-accent flex items-center justify-center font-syne font-extrabold text-white">
                ID
              </div>
              <h2 className="font-syne text-xl font-bold">Identificação</h2>
              <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-accent2 uppercase tracking-widest">Seu Nome</label>
                <input 
                  type="text"
                  name="lead_name"
                  required
                  placeholder="Como podemos te chamar?"
                  className="w-full bg-surface2 border border-border rounded-xl p-4 text-white focus:border-accent2 focus:ring-4 focus:ring-accent2/10 outline-none transition-all"
                  onChange={handleInputChange}
                  value={formData.lead_name || ''}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-accent2 uppercase tracking-widest">WhatsApp</label>
                <input 
                  type="tel"
                  name="lead_phone"
                  required
                  placeholder="(00) 00000-0000"
                  className={`w-full bg-surface2 border rounded-xl p-4 text-white focus:ring-4 outline-none transition-all ${phoneError ? 'border-red-500 focus:ring-red-500/10' : 'border-border focus:border-accent2 focus:ring-accent2/10'}`}
                  onChange={handleInputChange}
                  value={formData.lead_phone || ''}
                />
                {phoneError && (
                  <p className="text-red-500 text-[10px] font-bold uppercase tracking-wider mt-1">
                    {phoneError}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Block 1 */}
          <section className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent2 to-accent flex items-center justify-center font-syne font-extrabold text-white">
                01
              </div>
              <h2 className="font-syne text-xl font-bold">Sobre a sua empresa</h2>
              <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
            </div>

            <Question 
              num="01" 
              label="Qual é o nome da sua empresa e o seu setor de atuação?"
            >
              <textarea 
                name="q01"
                className="w-full bg-surface2 border border-border rounded-xl p-4 text-white focus:border-accent2 focus:ring-4 focus:ring-accent2/10 outline-none transition-all resize-none min-h-[100px]"
                placeholder="Ex: Clínica Sorriso Perfeito — setor de saúde/odontologia"
                onChange={handleInputChange}
                value={formData.q01 || ''}
              />
            </Question>

            <Question num="02" label="Há quanto tempo a empresa está no mercado?">
              <div className="grid gap-3">
                {['Menos de 1 ano', 'Entre 1 e 3 anos', 'Entre 3 e 5 anos', 'Mais de 5 anos'].map((opt, i) => (
                  <RadioOption 
                    key={i} 
                    name="q02" 
                    value={opt} 
                    label={opt} 
                    checked={formData.q02 === opt}
                    onChange={handleInputChange}
                  />
                ))}
              </div>
            </Question>

            <Question num="03" label="Qual é o faturamento médio mensal da empresa hoje?">
              <div className="grid gap-3">
                {[
                  'Abaixo de R$ 30.000',
                  'Entre R$ 30.000 e R$ 100.000',
                  'Entre R$ 100.000 e R$ 300.000',
                  'Entre R$ 300.000 e R$ 500.000',
                  'Acima de R$ 500.000'
                ].map((opt, i) => (
                  <RadioOption 
                    key={i} 
                    name="q03" 
                    value={opt} 
                    label={opt} 
                    checked={formData.q03 === opt}
                    onChange={handleInputChange}
                  />
                ))}
              </div>
            </Question>

            <Question num="04" label="Qual é o principal produto ou serviço que a empresa vende?">
              <textarea 
                name="q04"
                className="w-full bg-surface2 border border-border rounded-xl p-4 text-white focus:border-accent2 focus:ring-4 focus:ring-accent2/10 outline-none transition-all resize-none min-h-[100px]"
                placeholder="Descreva brevemente o que você oferece e para quem..."
                onChange={handleInputChange}
                value={formData.q04 || ''}
              />
            </Question>

            <Question num="05" label="Qual é o ticket médio da sua venda?">
              <div className="grid gap-3">
                {[
                  'Abaixo de R$ 500',
                  'Entre R$ 500 e R$ 2.000',
                  'Entre R$ 2.000 e R$ 10.000',
                  'Acima de R$ 10.000'
                ].map((opt, i) => (
                  <RadioOption 
                    key={i} 
                    name="q05" 
                    value={opt} 
                    label={opt} 
                    checked={formData.q05 === opt}
                    onChange={handleInputChange}
                  />
                ))}
              </div>
            </Question>
          </section>

          {/* Block 2 */}
          <section className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent2 to-accent flex items-center justify-center font-syne font-extrabold text-white">
                02
              </div>
              <h2 className="font-syne text-xl font-bold">Situação atual de marketing e vendas</h2>
              <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
            </div>

            <Question num="06" label="A empresa já investe ou investiu em tráfego pago (Google Ads, Meta Ads)?">
              <div className="grid gap-3">
                {[
                  'Nunca investiu',
                  'Já investiu, mas parou',
                  'Investe atualmente de forma interna',
                  'Investe atualmente com outra agência'
                ].map((opt, i) => (
                  <RadioOption 
                    key={i} 
                    name="q06" 
                    value={opt} 
                    label={opt} 
                    checked={formData.q06 === opt}
                    onChange={handleInputChange}
                  />
                ))}
              </div>
            </Question>

            <Question num="07" label="Se já investiu em tráfego pago, qual foi seu maior desafio ou frustração?">
              <textarea 
                name="q07"
                className="w-full bg-surface2 border border-border rounded-xl p-4 text-white focus:border-accent2 focus:ring-4 focus:ring-accent2/10 outline-none transition-all resize-none min-h-[100px]"
                placeholder="Se nunca investiu, pode pular esta pergunta..."
                onChange={handleInputChange}
                value={formData.q07 || ''}
              />
            </Question>

            <Question num="08" label="Hoje, de onde vêm a maioria dos seus clientes?">
              <div className="grid gap-3">
                {[
                  { id: 'a', label: 'Indicação / boca a boca' },
                  { id: 'b', label: 'Redes sociais (orgânico)' },
                  { id: 'c', label: 'Tráfego pago' },
                  { id: 'd', label: 'Prospecção ativa' },
                  { id: 'e', label: 'Outros' }
                ].map((opt) => (
                  <CheckboxOption 
                    key={opt.id} 
                    name={`q08${opt.id}`} 
                    label={opt.label} 
                    checked={formData[`q08${opt.id}`] || false}
                    onChange={handleInputChange}
                  />
                ))}
              </div>
            </Question>

            <Question num="09" label="A empresa possui um processo de vendas estruturado (CRM, funil, follow-up)?">
              <div className="grid gap-3">
                {[
                  'Não, tudo é informal',
                  'Temos algo básico, mas não é seguido',
                  'Sim, temos um processo bem definido'
                ].map((opt, i) => (
                  <RadioOption 
                    key={i} 
                    name="q09" 
                    value={opt} 
                    label={opt} 
                    checked={formData.q09 === opt}
                    onChange={handleInputChange}
                  />
                ))}
              </div>
            </Question>

            <Question num="10" label="A empresa produz conteúdo em vídeo para redes sociais atualmente?">
              <div className="grid gap-3">
                {[
                  'Não produz',
                  'Produz raramente / sem consistência',
                  'Produz com frequência, mas sem estratégia',
                  'Produz com consistência e estratégia'
                ].map((opt, i) => (
                  <RadioOption 
                    key={i} 
                    name="q10" 
                    value={opt} 
                    label={opt} 
                    checked={formData.q10 === opt}
                    onChange={handleInputChange}
                  />
                ))}
              </div>
            </Question>
          </section>

          {/* Block 3 */}
          <section className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent2 to-accent flex items-center justify-center font-syne font-extrabold text-white">
                03
              </div>
              <h2 className="font-syne text-xl font-bold">Objetivos e expectativas</h2>
              <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
            </div>

            <Question num="11" label="Qual é o principal objetivo que você quer alcançar com a nossa parceria?">
              <div className="grid gap-3">
                {[
                  'Aumentar o número de leads',
                  'Aumentar as vendas online',
                  'Fortalecer a marca e presença digital',
                  'Escalar o faturamento de forma previsível',
                  'Outro'
                ].map((opt, i) => (
                  <RadioOption 
                    key={i} 
                    name="q11" 
                    value={opt} 
                    label={opt} 
                    checked={formData.q11 === opt}
                    onChange={handleInputChange}
                  />
                ))}
              </div>
            </Question>

            <Question num="12" label="Em 6 meses, qual resultado concreto você esperaria ver para considerar essa parceria um sucesso?">
              <textarea 
                name="q12"
                className="w-full bg-surface2 border border-border rounded-xl p-4 text-white focus:border-accent2 focus:ring-4 focus:ring-accent2/10 outline-none transition-all resize-none min-h-[120px]"
                placeholder="Seja específico: número de leads, faturamento, crescimento percentual..."
                onChange={handleInputChange}
                value={formData.q12 || ''}
              />
            </Question>

            <Question num="13" label="Qual é o orçamento mensal disponível para investir em marketing digital?">
              <div className="grid gap-3">
                {[
                  'Até R$ 2.000/mês',
                  'Entre R$ 2.000 e R$ 5.000/mês',
                  'Entre R$ 5.000 e R$ 10.000/mês',
                  'Acima de R$ 10.000/mês',
                  'Ainda não sei / preciso de orientação'
                ].map((opt, i) => (
                  <RadioOption 
                    key={i} 
                    name="q13" 
                    value={opt} 
                    label={opt} 
                    checked={formData.q13 === opt}
                    onChange={handleInputChange}
                  />
                ))}
              </div>
            </Question>

            <Question num="14" label="Quem será o responsável por aprovar e acompanhar esse projeto dentro da empresa?">
              <div className="grid gap-3">
                {[
                  'Eu mesmo (sócio/dono)',
                  'Gerente de marketing',
                  'Precisa de aprovação de outros sócios'
                ].map((opt, i) => (
                  <RadioOption 
                    key={i} 
                    name="q14" 
                    value={opt} 
                    label={opt} 
                    checked={formData.q14 === opt}
                    onChange={handleInputChange}
                  />
                ))}
              </div>
            </Question>

            <Question num="15" label="Tem alguma informação importante sobre o seu negócio ou desafio específico que devemos saber antes da reunião?">
              <textarea 
                name="q15"
                className="w-full bg-surface2 border border-border rounded-xl p-4 text-white focus:border-accent2 focus:ring-4 focus:ring-accent2/10 outline-none transition-all resize-none min-h-[160px]"
                placeholder="Use este espaço livremente. Qualquer contexto adicional nos ajuda a preparar melhor..."
                onChange={handleInputChange}
                value={formData.q15 || ''}
              />
            </Question>
          </section>

          {/* Submit */}
          <div className="pt-8 text-center space-y-8">
            <p className="text-sm text-muted leading-relaxed">
              Suas respostas serão revisadas pela equipe antes da reunião.<br />
              Você receberá uma confirmação assim que enviar.
            </p>
            <button 
              type="submit"
              disabled={isSubmitting}
              className="group relative inline-flex items-center gap-3 bg-gradient-to-r from-accent2 to-accent text-white font-syne font-bold text-lg px-12 py-5 rounded-2xl shadow-2xl shadow-accent2/30 hover:shadow-accent2/50 hover:-translate-y-1 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {isSubmitting ? 'Enviando...' : 'Enviar e confirmar reunião'}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </form>

        <footer className="mt-24 pt-8 border-t border-border text-center text-[10px] text-muted uppercase tracking-[0.2em]">
          Formulário confidencial — suas respostas são usadas exclusivamente para fins de diagnóstico estratégico.
        </footer>
      </main>
    </div>
  );
}

function Question({ num, label, children }: { num: string; label: string; children: ReactNode }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="group bg-surface border border-border rounded-2xl p-6 md:p-8 relative overflow-hidden transition-all hover:border-accent2/30"
    >
      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-accent2 to-accent opacity-0 group-focus-within:opacity-100 transition-opacity" />
      <div className="text-[10px] font-bold text-accent2 uppercase tracking-[0.2em] mb-2">Pergunta {num}</div>
      <h3 className="text-base md:text-lg font-medium text-white mb-6 leading-relaxed">{label}</h3>
      {children}
    </motion.div>
  );
}

function RadioOption({ name, value, label, checked, onChange }: { name: string; value: string; label: string; checked: boolean; onChange: (e: any) => void; key?: any }) {
  return (
    <label className={`
      flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all
      ${checked ? 'bg-accent2/10 border-accent2/50 text-white' : 'bg-surface2 border-border text-muted hover:border-accent2/30 hover:text-white'}
    `}>
      <input 
        type="radio" 
        name={name} 
        value={value} 
        checked={checked} 
        onChange={onChange}
        className="hidden"
      />
      <div className={`
        w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all
        ${checked ? 'border-accent2 bg-accent2' : 'border-border'}
      `}>
        {checked && <div className="w-2 h-2 bg-white rounded-full" />}
      </div>
      <span className="text-sm font-medium">{label}</span>
    </label>
  );
}

function CheckboxOption({ name, label, checked, onChange }: { name: string; label: string; checked: boolean; onChange: (e: any) => void; key?: any }) {
  return (
    <label className={`
      flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all
      ${checked ? 'bg-accent2/10 border-accent2/50 text-white' : 'bg-surface2 border-border text-muted hover:border-accent2/30 hover:text-white'}
    `}>
      <input 
        type="checkbox" 
        name={name} 
        checked={checked} 
        onChange={onChange}
        className="hidden"
      />
      <div className={`
        w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all
        ${checked ? 'border-accent2 bg-accent2' : 'border-border'}
      `}>
        {checked && <Check className="w-3.5 h-3.5 text-white stroke-[3px]" />}
      </div>
      <span className="text-sm font-medium">{label}</span>
    </label>
  );
}

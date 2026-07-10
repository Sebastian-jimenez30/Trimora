-- Trimora MVP Schema

-- Habilitar extensión UUID
create extension if not exists "uuid-ossp";

-- Tabla de Clientes
create table public.clients (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users not null, -- El dueño de la barbería
  name text not null,
  phone text,
  email text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabla de Citas
create table public.appointments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users not null,
  client_id uuid references public.clients not null,
  service_name text not null,
  scheduled_at timestamp with time zone not null,
  status text default 'pending', -- pending, completed, cancelled
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabla de Transacciones (Caja)
create table public.transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users not null,
  appointment_id uuid references public.appointments,
  amount numeric(10,2) not null,
  type text not null, -- income, expense
  description text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Activar RLS
alter table public.clients enable row level security;
alter table public.appointments enable row level security;
alter table public.transactions enable row level security;

-- Políticas de RLS
create policy "Los usuarios solo pueden ver y editar sus propios clientes"
  on public.clients for all
  using (auth.uid() = user_id);

create policy "Los usuarios solo pueden ver y editar sus propias citas"
  on public.appointments for all
  using (auth.uid() = user_id);

create policy "Los usuarios solo pueden ver y editar sus propias transacciones"
  on public.transactions for all
  using (auth.uid() = user_id);

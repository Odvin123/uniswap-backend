const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// Inicializar Supabase con SERVICE_KEY
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Función para asegurar que el perfil existe
const asegurarPerfil = async (userId, email, nombre) => {
  const { data: perfilExistente } = await supabase
    .from('perfiles')
    .select('id')
    .eq('id', userId)
    .single();
  
  if (!perfilExistente) {
    await supabase
      .from('perfiles')
      .insert({
        id: userId,
        email: email,
        nombre: nombre || email.split('@')[0],
        created_at: new Date().toISOString()
      });
  }
};

// Middleware para verificar token
const verificarToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  
  req.user = user;
  next();
};

// ==================== RUTAS DE PRUEBA ====================
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'UNISWAP Backend funcionando!' });
});

// ==================== RUTAS DE MATERIALES ====================

// Obtener todos los materiales activos
app.get('/api/materiales', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('materiales')
      .select('*')
      .eq('activo', true)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crear un nuevo material
// Crear un nuevo material
app.post('/api/materiales', verificarToken, async (req, res) => {
  try {
    const { titulo, tipo, carrera, estado, descripcion, imagen_url } = req.body;
    
    // Asegurar que el perfil existe
    await asegurarPerfil(req.user.id, req.user.email, req.user.user_metadata?.name);
    
    // Obtener el nombre del usuario
    const nombreUsuario = req.user.user_metadata?.name || req.user.email.split('@')[0];
    
    const { data, error } = await supabase
      .from('materiales')
      .insert({
        titulo,
        tipo,
        carrera,
        estado,
        descripcion,
        imagen_url,
        usuario_id: req.user.id,
        usuario_nombre: nombreUsuario,  // ← IMPORTANTE: Guardar el nombre
        usuario_email: req.user.email,
        activo: true,
        created_at: new Date().toISOString()
      })
      .select();
    
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE ESTADÍSTICAS ====================

// ==================== RUTAS DE ESTADÍSTICAS ====================
app.get('/api/estadisticas', async (req, res) => {
  try {
    // Materiales activos
    const { data: materiales, error: errorMat } = await supabase
      .from('materiales')
      .select('*')
      .eq('activo', true);
    
    // Usuarios únicos (de la tabla perfiles)
    const { data: perfiles, error: errorPerf } = await supabase
      .from('perfiles')
      .select('id');
    
    // Solicitudes aceptadas
    const { data: solicitudes, error: errorSol } = await supabase
      .from('solicitudes')
      .select('*')
      .eq('estado', 'aceptada');
    
    const materialesActivos = materiales?.length || 0;
    const estudiantesActivos = perfiles?.length || 0;
    const intercambiosRealizados = solicitudes?.length || 0;
    const co2Evitado = intercambiosRealizados * 7.5;
    
    console.log("📊 Estadísticas calculadas:", {
      materialesActivos,
      estudiantesActivos,
      intercambiosRealizados,
      co2Evitado
    });
    
    res.json({
      materialesRescatados: materialesActivos,
      estudiantesActivos: estudiantesActivos,
      co2Evitado: Math.round(co2Evitado),
      intercambiosRealizados: intercambiosRealizados
    });p
  } catch (error) {
    console.error("Error en estadísticas:", error);
    res.status(500).json({ error: error.message });
  }
});
// Eliminar material (soft delete)
app.delete('/api/materiales/:id', verificarToken, async (req, res) => {
  try {
    const { error } = await supabase
      .from('materiales')
      .update({ activo: false })
      .eq('id', req.params.id)
      .eq('usuario_id', req.user.id);
    
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE PERFIL ====================

// Obtener perfil
app.get('/api/perfil/:id', async (req, res) => {
  try {
    let { data, error } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error && error.code === 'PGRST116') {
      // Perfil no existe, crear uno por defecto
      const nuevoPerfil = {
        id: req.params.id,
        email: '',
        nombre: 'Usuario',
        created_at: new Date().toISOString()
      };
      const { data: created, error: insertError } = await supabase
        .from('perfiles')
        .insert(nuevoPerfil)
        .select();
      
      if (insertError) throw insertError;
      return res.json(created[0]);
    }
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Actualizar perfil
app.put('/api/perfil', verificarToken, async (req, res) => {
  try {
    const { nombre, carrera, telefono, biografia, avatar_url } = req.body;
    
    const { data, error } = await supabase
      .from('perfiles')
      .upsert({
        id: req.user.id,
        email: req.user.email,
        nombre,
        carrera,
        telefono,
        biografia,
        avatar_url,
        created_at: new Date().toISOString()
      })
      .select();
    
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE SOLICITUDES ====================

// Crear un nuevo material
app.post('/api/materiales', verificarToken, async (req, res) => {
  try {
    const { titulo, tipo, carrera, estado, descripcion, imagen_url } = req.body;
    
    console.log("📦 Creando material para usuario:", req.user.id);
    console.log("Datos:", { titulo, tipo, carrera, estado });
    
    // Asegurar que el perfil existe
    await asegurarPerfil(req.user.id, req.user.email, req.user.user_metadata?.name);
    
    // Obtener el nombre del usuario
    const nombreUsuario = req.user.user_metadata?.name || req.user.email.split('@')[0];
    
    const { data, error } = await supabase
      .from('materiales')
      .insert({
        titulo,
        tipo,
        carrera,
        estado,
        descripcion,
        imagen_url: imagen_url || null,
        usuario_id: req.user.id,
        usuario_nombre: nombreUsuario,
        usuario_email: req.user.email,  // ← Esta columna ya existe
        activo: true,
        created_at: new Date().toISOString()
      })
      .select();
    
    if (error) {
      console.error("❌ Error al insertar:", error);
      throw error;
    }
    
    console.log("✅ Material creado:", data[0]);
    res.json(data[0]);
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/solicitudes', verificarToken, async (req, res) => {
  try {
    const { material_id, material_titulo, propietario_id, propietario_nombre, propietario_email } = req.body;
    
    console.log("📝 Creando solicitud...");
    console.log("Material:", material_titulo);
    console.log("Solicitante:", req.user.id);
    console.log("Propietario:", propietario_id);
    
    // Asegurar que el perfil del solicitante existe
    await asegurarPerfil(req.user.id, req.user.email, req.user.user_metadata?.name);
    
    // Asegurar que el perfil del propietario existe
    await asegurarPerfil(propietario_id, propietario_email, propietario_nombre);
    
    const { data, error } = await supabase
      .from('solicitudes')
      .insert({
        material_id,
        material_titulo,
        solicitante_id: req.user.id,
        solicitante_nombre: req.user.user_metadata?.name || req.user.email.split('@')[0],
        solicitante_email: req.user.email,
        propietario_id,
        propietario_nombre,
        propietario_email,
        estado: 'pendiente',
        created_at: new Date().toISOString()
      })
      .select();
    
    if (error) {
      console.error("❌ Error al insertar:", error);
      throw error;
    }
    
    console.log("✅ Solicitud creada:", data[0]);
    res.json(data[0]);
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener solicitudes recibidas
app.get('/api/solicitudes/recibidas', verificarToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('solicitudes')
      .select('*')
      .eq('propietario_id', req.user.id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener solicitudes enviadas
app.get('/api/solicitudes/enviadas', verificarToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('solicitudes')
      .select('*')
      .eq('solicitante_id', req.user.id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Aceptar solicitud
app.put('/api/solicitudes/:id/aceptar', verificarToken, async (req, res) => {
  try {
    const { error } = await supabase
      .from('solicitudes')
      .update({ estado: 'aceptada', respuesta_fecha: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('propietario_id', req.user.id);
    
    if (error) throw error;
    
    // Desactivar el material
    const { data: solicitud } = await supabase
      .from('solicitudes')
      .select('material_id')
      .eq('id', req.params.id)
      .single();
    
    if (solicitud) {
      await supabase
        .from('materiales')
        .update({ activo: false })
        .eq('id', solicitud.material_id);
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rechazar solicitud
app.put('/api/solicitudes/:id/rechazar', verificarToken, async (req, res) => {
  try {
    const { error } = await supabase
      .from('solicitudes')
      .update({ estado: 'rechazada', respuesta_fecha: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('propietario_id', req.user.id);
    
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancelar solicitud
app.delete('/api/solicitudes/:id', verificarToken, async (req, res) => {
  try {
    const { error } = await supabase
      .from('solicitudes')
      .delete()
      .eq('id', req.params.id)
      .eq('solicitante_id', req.user.id)
      .eq('estado', 'pendiente');
    
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RUTAS DE MENSAJES ====================


app.get('/api/mensajes/:chatId', verificarToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    console.log("📩 Obteniendo mensajes del chat:", chatId);
    
    const { data, error } = await supabase
      .from('mensajes')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    console.log(`✅ ${data?.length || 0} mensajes encontrados`);
    res.json(data || []);
  } catch (error) {
    console.error("❌ Error al obtener mensajes:", error);
    res.status(500).json({ error: error.message });
  }
});

// Enviar mensaje
// Enviar mensaje
app.post('/api/mensajes', verificarToken, async (req, res) => {
  try {
    const { chat_id, texto } = req.body;
    
    console.log("📤 Enviando mensaje...");
    console.log("- Chat ID:", chat_id);
    console.log("- Emisor:", req.user.id);
    console.log("- Texto:", texto);
    
    const { data, error } = await supabase
      .from('mensajes')
      .insert({
        chat_id,
        emisor_id: req.user.id,
        emisor_nombre: req.user.user_metadata?.name || req.user.email.split('@')[0],
        texto,
        created_at: new Date().toISOString()
      })
      .select();
    
    if (error) {
      console.error("❌ Error al insertar:", error);
      throw error;
    }
    
    console.log("✅ Mensaje guardado:", data[0]);
    res.json(data[0]);
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ error: error.message });
  }
});
// ==================== INICIAR SERVIDOR ====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 UNISWAP Backend corriendo en http://localhost:${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
});
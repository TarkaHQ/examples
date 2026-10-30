package com.tarkahq.kura

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.*
import android.os.*
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID
import kotlin.math.abs

/** Microphone capture lives in an Android foreground service, independently of Flutter's UI. */
class RecorderService : Service() {
    companion object {
        @Volatile var active = false
        @Volatile var paused = false
        @Volatile var amplitude = 0.0
        @Volatile var elapsed = 0L
        @Volatile var currentId = ""
        @Volatile var lastError = ""
        fun header(file: File) {
            if (file.length() < 44) return
            val size = file.length().toInt() - 44
            val b = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
            b.put("RIFF".toByteArray()).putInt(size+36).put("WAVEfmt ".toByteArray()).putInt(16)
            b.putShort(1).putShort(1).putInt(16000).putInt(32000).putShort(2).putShort(16)
            b.put("data".toByteArray()).putInt(size)
            RandomAccessFile(file,"rw").use { it.write(b.array()) }
        }
    }
    private var thread: Thread? = null
    private var wake: PowerManager.WakeLock? = null
    override fun onBind(intent: Intent?) = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            "stop" -> { active=false; return START_NOT_STICKY }
            "pause" -> { paused=!paused; return START_NOT_STICKY }
        }
        if (active) return START_NOT_STICKY
        currentId=UUID.randomUUID().toString(); elapsed=0; paused=false; lastError=""
        val dir=File(filesDir,"recordings/$currentId");dir.mkdirs()
        File(dir,"title.txt").writeText(intent?.getStringExtra("title") ?: "Conversation")
        val manager=getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("recording","Recording",NotificationManager.IMPORTANCE_LOW))
        val stop=PendingIntent.getService(this,1,Intent(this,RecorderService::class.java).setAction("stop"),PendingIntent.FLAG_IMMUTABLE)
        val open=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE)
        val notification=Notification.Builder(this,"recording").setContentTitle("Kura is recording")
            .setContentText("Your conversation is saved on this phone.").setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(open).setOngoing(true).addAction(Notification.Action.Builder(null,"Stop",stop).build()).build()
        if(Build.VERSION.SDK_INT>=29)startForeground(41,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE) else startForeground(41,notification)
        wake=(getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"kura:recording").apply{acquire(2*60*60*1000L+60000)}
        active=true
        thread=Thread {
            var recorder: AudioRecord?=null;var out: RandomAccessFile?=null;var file:File?=null
            try {
                val min=AudioRecord.getMinBufferSize(16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT)
                recorder=AudioRecord(MediaRecorder.AudioSource.MIC,16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,maxOf(min,8192))
                check(recorder.state==AudioRecord.STATE_INITIALIZED){"Microphone unavailable"}
                recorder.startRecording()
                val buffer=ShortArray(1600);var seq=0;var chunkSamples=0;var totalSamples=0L
                fun closeChunk(){out?.fd?.sync();out?.close();out=null;file?.let{header(it)}}
                while(active && totalSamples<16000L*7200) {
                    val n=recorder.read(buffer,0,buffer.size)
                    check(n>=0){"Microphone interrupted"}
                    if(paused){amplitude=0.0;continue}
                    if(n==0)continue
                    if(out==null){file=File(dir,"%06d.wav".format(seq++));out=RandomAccessFile(file,"rw");out!!.write(ByteArray(44));chunkSamples=0}
                    val bytes=ByteBuffer.allocate(n*2).order(ByteOrder.LITTLE_ENDIAN)
                    var peak=0
                    for(i in 0 until n){bytes.putShort(buffer[i]);peak=maxOf(peak,abs(buffer[i].toInt()))}
                    out!!.write(bytes.array());chunkSamples+=n;totalSamples+=n;elapsed=totalSamples/16000;amplitude=peak/32768.0
                    if(chunkSamples>=16000*30)closeChunk()
                }
                closeChunk()
            } catch(e:Exception){lastError="Recording was interrupted. Saved audio can still be uploaded."}
            finally {try{out?.close();file?.let{header(it)};recorder?.stop();recorder?.release()}catch(_:Exception){};active=false;paused=false;amplitude=0.0;stopSelf()}
        }.apply{start()}
        return START_NOT_STICKY
    }
    override fun onDestroy(){active=false;thread?.join(2000);if(wake?.isHeld==true)wake?.release();super.onDestroy()}
}

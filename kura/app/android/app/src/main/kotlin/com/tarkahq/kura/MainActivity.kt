package com.tarkahq.kura
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

class MainActivity : FlutterActivity() {
    private var permissionResult: MethodChannel.Result?=null
    override fun configureFlutterEngine(engine: FlutterEngine) {
        super.configureFlutterEngine(engine)
        MethodChannel(engine.dartExecutor.binaryMessenger,"kura/recorder").setMethodCallHandler { call,result ->
            try {
                val root=File(filesDir,"recordings");root.mkdirs()
                fun directory():File {
                    val id=call.argument<String>("id") ?: error("Missing recording")
                    require(Regex("[a-f0-9-]{36}").matches(id))
                    return File(root,id)
                }
                when(call.method) {
                    "permission" -> {
                        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)result.success(true)
                        else {permissionResult=result;requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO),71)}
                    }
                    "start" -> {check(!RecorderService.active);val i=Intent(this,RecorderService::class.java).putExtra("title",call.argument<String>("title"));startForegroundService(i);result.success(null)}
                    "stop","pause" -> {startService(Intent(this,RecorderService::class.java).setAction(call.method));result.success(null)}
                    "status" -> result.success(mapOf("active" to RecorderService.active,"paused" to RecorderService.paused,"seconds" to RecorderService.elapsed,"amplitude" to RecorderService.amplitude,"error" to RecorderService.lastError))
                    "recordings" -> result.success(root.listFiles()?.filter{it.isDirectory && !(RecorderService.active && it.name==RecorderService.currentId)}?.sortedByDescending{it.lastModified()}?.map{dir ->
                        val files=dir.listFiles()?.filter{it.extension=="wav" && it.length()>44}?.sortedBy{it.name} ?: emptyList()
                        files.forEach{RecorderService.header(it)}
                        mapOf("id" to dir.name,"title" to (File(dir,"title.txt").takeIf{it.exists()}?.readText() ?: "Recovered conversation"),"chunks" to files.size,"bytes" to files.sumOf{it.length()})
                    } ?: emptyList<Any>())
                    "readChunk" -> {val files=directory().listFiles()!!.filter{it.extension=="wav" && it.length()>44}.sortedBy{it.name};result.success(files[call.argument<Int>("seq")!!].readBytes())}
                    "delete" -> {val dir=directory();check(!RecorderService.active || dir.name!=RecorderService.currentId);dir.deleteRecursively();result.success(null)}
                    else -> result.notImplemented()
                }
            }catch(e:Exception){result.error("recorder",e.message,null)}
        }
    }
    override fun onRequestPermissionsResult(requestCode:Int,permissions:Array<out String>,grantResults:IntArray) {
        super.onRequestPermissionsResult(requestCode,permissions,grantResults)
        if(requestCode==71){permissionResult?.success(grantResults.firstOrNull()==PackageManager.PERMISSION_GRANTED);permissionResult=null}
    }
}

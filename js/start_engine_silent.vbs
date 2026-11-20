Set FSO = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")
JsDir = FSO.GetParentFolderName(WScript.ScriptFullName)
ServerJs = FSO.BuildPath(JsDir, "media_engine_server.js")
WshShell.Run "node """ & ServerJs & """", 0, False

"""Send a Python file to Blender through the Blender Lab MCP server (execute_blender_code) and print the result."""
import asyncio, json, sys
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
async def main(path):
    code = open(path).read()
    params = StdioServerParameters(command="/home/ubuntu/opt/blender-mcp/server/.venv/bin/blender-mcp", args=[], env={"BLENDER_MCP_PORT": "9876", "PATH": "/usr/bin:/bin"})
    async with stdio_client(params, errlog=open('/dev/null', 'w')) as (r, w):
        async with ClientSession(r, w) as s:
            await s.initialize()
            res = await s.call_tool("execute_blender_code", {"code": code})
            for c in res.content:
                t = getattr(c, 'text', '')
                try: d = json.loads(t); print(json.dumps(d, indent=1)[-4000:])
                except Exception: print(t[:3000])
asyncio.run(main(sys.argv[1]))

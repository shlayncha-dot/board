using Microsoft.Extensions.Options;
using System.Text.Json.Serialization;
using SLS_Planning_1C.Server.Features.FileIndexing;
using SLS_Planning_1C.Server.Features.Naming;
using SLS_Planning_1C.Server.Features.RouteSheetSettings;
using SLS_Planning_1C.Server.Features.Verification;
using SLS_Planning_1C.Server.Features.Users;
using SLS_Planning_1C.Server.Features.AssemblyStages;
using SLS_Planning_1C.Server.Features.SpecificationUpload;

var builder = WebApplication.CreateBuilder(args);

// Allow larger JSON payloads for file-index sync snapshots.
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 100_000_000;
});
builder.Services.Configure<IISServerOptions>(options =>
{
    options.MaxRequestBodySize = 100_000_000;
});

// Add services to the container.

builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
});
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSingleton<IFileIndexStore, FileIndexStore>();
builder.Services.AddScoped<IVerificationService, VerificationService>();
builder.Services.AddSingleton<IVerificationSettingsStore, VerificationSettingsStore>();
builder.Services.AddScoped<INamingService, NamingService>();
builder.Services.AddSingleton<INamingCredentialsStore, NamingRuntimeCredentialsStore>();
builder.Services.Configure<NamingApiOptions>(builder.Configuration.GetSection("ExternalApis:Naming"));
builder.Services.AddSingleton<IUserStore, UserStore>();
builder.Services.AddSingleton<IRouteSheetSettingsStore, RouteSheetSettingsStore>();
builder.Services.AddSingleton<IAssemblyStagesStore, AssemblyStagesStore>();
builder.Services.AddSingleton<ISpecificationUploadStore, SpecificationUploadStore>();

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.MapFallbackToFile("/index.html");

app.Run();
